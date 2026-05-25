---
name: QA Test Run
about: Step-by-step test plan for a feature — assign to a tester
title: "QA: [Feature Name] — [Brief Scope]"
labels: qa
assignees: ''
---

## Feature

<!-- Brief description of what's being tested. Keep it 2–3 sentences. -->

## Environment

- **Branch / version:**
- **Device / OS:**
- **Browser:**
- **Wallet (if applicable):**

## Preconditions

<!-- Steps to set up before testing begins. e.g. "Log in as user X", "Ensure wallet has at least 0.5 CELO". -->

- [ ] Precondition 1
- [ ] Precondition 2

---

## Test Cases

### TC-01: [Short, descriptive title]

1. Step 1
2. Step 2
3. Step 3

**Expected:** What the tester should see.

- [ ] Pass
- [ ] Fail
- [ ] Blocked

*Notes:* (optional)

---

### TC-02: [Short, descriptive title]

1. Step 1
2. Step 2

**Expected:** What the tester should see.

- [ ] Pass
- [ ] Fail
- [ ] Blocked

*Notes:* (optional)

---

<!-- Copy the TC block above for each test case. Keep TCs focused — one behavior per case. -->

---

## Edge Cases & Regression

Check that scenarios below still work (no regressions).

- [ ] [Edge case 1] — Pass / Fail / Blocked
- [ ] [Edge case 2] — Pass / Fail / Blocked

---

## Summary

- [ ] All tests pass — ready to ship
- [ ] Failures found (see notes below)
- [ ] Blocked (cannot proceed — blocker found)


