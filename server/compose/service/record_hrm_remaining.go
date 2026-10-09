package service

import (
	"strconv"
	"strings"
	"time"

	"github.com/cortezaproject/corteza/server/compose/types"
	"github.com/cortezaproject/corteza/server/pkg/dal"
	"github.com/cortezaproject/corteza/server/pkg/ql"
)

// Only the HRM balance contract opts into this read projection. Never save it.
func hrmBalanceModule(m *types.Module) bool {
	if m == nil || m.Handle != "leave_balance" {
		return false
	}
	for _, name := range []string{"entitlement", "carried_in", "carried_expires", "adjustment", "used", "opening_used", "used_from_carried", "remaining"} {
		if m.Fields.FindByName(name) == nil {
			return false
		}
	}
	return true
}

func hrmBusinessDay(now time.Time) string {
	return now.In(time.FixedZone("Asia/Ho_Chi_Minh", 7*60*60)).Format("2006-01-02")
}

func hrmRemainingRead(m *types.Module, now time.Time, rr ...*types.Record) {
	if !hrmBalanceModule(m) {
		return
	}
	day := hrmBusinessDay(now)
	for _, r := range rr {
		number := func(name string) float64 {
			if v := r.Values.Get(name, 0); v != nil {
				n, _ := strconv.ParseFloat(v.Value, 64)
				return n
			}
			return 0
		}
		carry := number("carried_in")
		if v := r.Values.Get("carried_expires", 0); v != nil && len(v.Value) >= 10 && day > v.Value[:10] {
			carry = number("used_from_carried")
		}
		remaining := number("entitlement") + carry + number("adjustment") - number("used") - number("opening_used")
		r.Values = r.Values.Replace("remaining", strconv.FormatFloat(remaining, 'f', -1, 64))
	}
}

// Rewrite the parsed symbol, preserving aliases and all caller scope filters.
// The DAL still aggregates in the database; no balance records are fetched here.
func hrmRemainingReport(m *types.Module, now time.Time, aa []dal.AggregateAttr) error {
	if !hrmBalanceModule(m) {
		return nil
	}
	for i := range aa {
		if aa[i].RawExpr == "" {
			continue
		}
		node, err := ql.NewParser().Parse(aa[i].RawExpr)
		if err != nil {
			return err
		}
		changed := false
		err = node.Traverse(func(n *ql.ASTNode) (bool, *ql.ASTNode, error) {
			if !strings.EqualFold(n.Symbol, "remaining") {
				return true, n, nil
			}
			changed = true
			replacement, err := ql.NewParser().Parse("hrm_remaining(entitlement, adjustment, used, opening_used, carried_in, used_from_carried, carried_expires, '" + hrmBusinessDay(now) + "')")
			return false, replacement, err
		})
		if err != nil {
			return err
		}
		if changed {
			aa[i].RawExpr = ""
			aa[i].Expression = node
		}
	}
	return nil
}
