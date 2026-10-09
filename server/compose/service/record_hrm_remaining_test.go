package service

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/cortezaproject/corteza/server/compose/types"
	"github.com/cortezaproject/corteza/server/pkg/dal"
	"github.com/cortezaproject/corteza/server/store/adapters/rdbms/drivers/sqlite"
	sqlql "github.com/cortezaproject/corteza/server/store/adapters/rdbms/ql"
	"github.com/doug-martin/goqu/v9"
	_ "github.com/mattn/go-sqlite3"
	"github.com/stretchr/testify/require"
)

func hrmTestModule() *types.Module {
	m := &types.Module{Handle: "leave_balance"}
	for _, name := range []string{"entitlement", "carried_in", "carried_expires", "adjustment", "used", "opening_used", "used_from_carried", "remaining"} {
		m.Fields = append(m.Fields, &types.ModuleField{Name: name})
	}
	return m
}

func TestHRMRemainingReadWithoutSave(t *testing.T) {
	m := hrmTestModule()
	for _, consumed := range []bool{false, true} {
		r := &types.Record{}
		r.Values = r.Values.Replace("entitlement", "3").Replace("carried_in", "3").Replace("remaining", "6").Replace("carried_expires", "2026-03-31T00:00:00Z")
		if consumed {
			r.Values = r.Values.Replace("used", "2").Replace("used_from_carried", "2")
		}
		original := append(types.RecordValueSet(nil), r.Values...)
		before, _ := time.Parse(time.RFC3339, "2026-03-31T16:59:59Z")
		after := before.Add(time.Second)
		hrmRemainingRead(m, before, r)
		expected := "6"
		if consumed {
			expected = "4"
		}
		require.Equal(t, expected, r.Values.Get("remaining", 0).Value)
		hrmRemainingRead(m, after, r)
		require.Equal(t, "3", r.Values.Get("remaining", 0).Value)
		require.Equal(t, "6", original.Get("remaining", 0).Value, "projection must not mutate the stored value object")
		require.Equal(t, "3", r.Values.Get("carried_in", 0).Value)
	}
	unrelated := hrmTestModule()
	unrelated.Handle = "other"
	r := &types.Record{Values: types.RecordValueSet{}.Replace("remaining", "99")}
	hrmRemainingRead(unrelated, time.Now(), r)
	require.Equal(t, "99", r.Values.Get("remaining", 0).Value)
}

func TestHRMRemainingReportSQL(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	require.NoError(t, err)
	defer db.Close()
	_, err = db.Exec(`CREATE TABLE balances (entitlement REAL, adjustment REAL, used REAL, opening_used REAL, carried_in REAL, used_from_carried REAL, carried_expires TEXT, remaining REAL, self_email TEXT)`)
	require.NoError(t, err)
	_, err = db.Exec(`INSERT INTO balances VALUES (3,NULL,0,NULL,3,0,'2026-03-31T00:00:00Z',6,'mine'), (3,0,2,0,3,2,'2026-03-31T00:00:00Z',4,'mine'), (100,0,0,0,100,0,'2026-03-31T00:00:00Z',200,'other')`)
	require.NoError(t, err)
	for _, tc := range []struct {
		instant  string
		expected float64
	}{{"2026-03-31T16:59:59Z", 10}, {"2026-03-31T17:00:00Z", 6}} {
		now, err := time.Parse(time.RFC3339, tc.instant)
		require.NoError(t, err)
		attrs := []dal.AggregateAttr{{Identifier: "rp", RawExpr: "sum(remaining)"}}
		require.NoError(t, hrmRemainingReport(hrmTestModule(), now, attrs))
		require.Equal(t, "rp", attrs[0].Identifier)
		conv := sqlql.Converter(sqlql.RefHandler(sqlite.Dialect().ExprHandler))
		expression, err := conv.Convert(attrs[0].Expression)
		require.NoError(t, err)
		query, args, err := sqlite.Dialect().GOQU().From("balances").Select(expression).Where(goqu.Ex{"self_email": "mine"}).Prepared(true).ToSQL()
		require.NoError(t, err)
		var actual float64
		require.NoError(t, db.QueryRow(query, args...).Scan(&actual))
		require.Equal(t, tc.expected, actual, "aggregate ignores the stale persisted remaining and preserves scope")
	}
}

type hrmReadAC struct{ remaining bool }

func (ac hrmReadAC) CanReadRecordValueOnModuleField(_ context.Context, f *types.ModuleField) bool {
	return f.Name == "remaining" && ac.remaining
}
func (ac hrmReadAC) CanUpdateRecordValueOnModuleField(context.Context, *types.ModuleField) bool {
	return false
}

func TestHRMRemainingReadFieldACL(t *testing.T) {
	for _, allowed := range []bool{true, false} {
		r := &types.Record{Values: types.RecordValueSet{}.Replace("entitlement", "3").Replace("used", "2").Replace("used_from_carried", "2").Replace("carried_in", "3").Replace("carried_expires", "2000-03-31T00:00:00Z").Replace("remaining", "4")}
		ComposeRecordFilterAC(context.Background(), hrmReadAC{remaining: allowed}, hrmTestModule(), r)
		require.Nil(t, r.Values.Get("used", 0))
		if allowed {
			require.Equal(t, "3", r.Values.Get("remaining", 0).Value)
		} else {
			require.Empty(t, r.Values)
		}
	}
}
