package dal

import (
	"context"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestHRMRemainingFallback(t *testing.T) {
	expiry, err := time.Parse(time.RFC3339, "2026-03-31T00:00:00Z")
	require.NoError(t, err)
	for _, tc := range []struct {
		day      string
		expected float64
	}{{"2026-03-31", 4}, {"2026-04-01", 3}} {
		runner, err := newRunnerGval("hrm_remaining(entitlement, adjustment, used, opening_used, carried_in, used_from_carried, carried_expires, '" + tc.day + "')")
		require.NoError(t, err)
		row := (&Row{}).WithValue("entitlement", 0, float64(3)).WithValue("adjustment", 0, nil).WithValue("used", 0, float64(2)).WithValue("opening_used", 0, nil).WithValue("carried_in", 0, float64(3)).WithValue("used_from_carried", 0, float64(2)).WithValue("carried_expires", 0, expiry)
		value, err := runner.Eval(context.Background(), row)
		require.NoError(t, err)
		require.Equal(t, tc.expected, value)
	}
}
