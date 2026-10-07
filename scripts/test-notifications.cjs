// Run: node --experimental-vm-modules scripts/test-notifications.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

(async () => {
  const module = new vm.SourceTextModule(fs.readFileSync('js/notification-utils.js', 'utf8'));
  await module.link(() => { throw Error('Unexpected import'); });
  await module.evaluate();
  const { buildNotifications, visibleNotifications } = module.namespace;
  const now = new Date('2026-10-07T10:00:00');
  const input = {
    reminders: [
      { id: 'due', status: 'active', due_date: '2026-10-07', due_time: '09:00' },
      { id: 'later', status: 'active', due_date: '2026-10-07', due_time: '12:00' },
      { id: 'done', status: 'done', due_date: '2026-10-06' },
      { id: 'snoozed', status: 'snoozed', due_date: '2026-10-01', snooze_until: '2026-10-08' },
      { id: 'wake', status: 'snoozed', snooze_until: '2026-10-07' },
      { id: 'bad-date', status: 'active', due_date: '2026-02-30' }
    ],
    goals: [
      { id: 'overdue', status: 'active', target_date: '2026-10-06' },
      { id: 'soon', status: 'not_started', target_date: '2026-10-14' },
      { id: 'stale', status: 'active', updated_at: '2026-09-20T10:00:00' },
      { id: 'fresh', status: 'active', updated_at: '2026-10-07T09:00:00' },
      { id: 'paused', status: 'paused', target_date: '2026-10-06' },
      { id: 'achieved', status: 'achieved', target_date: '2026-10-06' }
    ],
    nodes: [{ id: 'root' }, { id: 'leaf', parent_id: 'root' }, { id: 'excluded', exclude_from_training: true }],
    positions: [{ id: 'p' }, { id: 'disabled', review_enabled: false }],
    repairs: [{ id: 'solved', status: 'solved', severity: 'critical' }, { id: 'critical', status: 'captured', severity: 'critical' }],
    reviewItems: [
      { id: 'r1', source_type: 'opening_line', source_id: 'leaf', status: 'active', due_at: '2026-10-07T08:00:00' },
      { id: 'root-review', source_type: 'opening_line', source_id: 'root', status: 'active', due_at: '2026-10-07T08:00:00' },
      { id: 'excluded-review', source_type: 'opening_line', source_id: 'excluded', status: 'active', due_at: '2026-10-07T08:00:00' },
      { id: 'r2', source_type: 'position', source_id: 'p', status: 'active', due_at: '2026-10-07T08:00:00' },
      { id: 'orphan', source_type: 'position', source_id: 'missing', status: 'active', due_at: '2026-10-07T08:00:00' },
      { id: 'off', source_type: 'position', source_id: 'disabled', status: 'active', due_at: '2026-10-07T08:00:00' },
      { id: 'solved-review', source_type: 'repair', source_id: 'solved', status: 'active', due_at: '2026-10-07T08:00:00' }
    ],
    events: [
      { id: 'soon', status: 'planned', event_date: '2026-10-10' },
      { id: 'past', status: 'active', event_date: '2026-10-01' },
      { id: 'cancelled', status: 'cancelled', event_date: '2026-10-10' }
    ]
  };
  const items = buildNotifications(input, now);
  assert.equal(items.filter(item => item.category === 'reminders').length, 2);
  assert.equal(items.filter(item => item.category === 'goals').length, 3);
  assert.equal(items.filter(item => item.category === 'reviews').length, 2);
  assert.equal(items.filter(item => item.category === 'repairs').length, 1);
  assert.equal(items.filter(item => item.category === 'events').length, 1);
  assert.equal(items[0].priority, 0);
  assert.equal(items.find(item => item.category === 'reviews' && item.action.mode === 'opening_lines').title, '1 opening line ready to review');
  const review = items.find(item => item.category === 'reviews');
  assert.ok(buildNotifications(input, new Date('2026-10-08T09:00:00')).some(item => item.id === review.id));
  const state = { [review.id]: { snoozedUntil: '2026-10-08T10:00:00' } };
  assert.ok(!visibleNotifications(items, state, {}, new Date('2026-10-08T09:00:00')).some(item => item.id === review.id));
  assert.ok(visibleNotifications(items, state, {}, new Date('2026-10-08T10:01:00')).some(item => item.id === review.id));
  assert.ok(!visibleNotifications(items, { [review.id]: { dismissed: true } }, {}, now).some(item => item.id === review.id));
  assert.ok(!visibleNotifications(items, {}, { goals: false }, now).some(item => item.category === 'goals'));
  input.reviewItems[0].due_at = '2026-10-09T08:00:00';
  assert.equal(buildNotifications(input, now).filter(item => item.category === 'reviews').length, 1);
  assert.equal(buildNotifications({}, now).length, 0);
  console.log('PASS: due times, snoozed reminders, goals, source-aware reviews, repairs, events, midnight snoozes, dismissals, category settings, and review completion.');
})().catch(error => { console.error(error); process.exitCode = 1; });
