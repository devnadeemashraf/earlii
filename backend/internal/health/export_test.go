package health

// Waiters reports how many callers wait on c's current run, so tests can wait
// for a state instead of sleeping. It is compiled into tests only.
func Waiters(c *Checker) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cur == nil {
		return 0
	}
	return c.cur.waiters
}
