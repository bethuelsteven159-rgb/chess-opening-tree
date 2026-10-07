// Run: node --experimental-vm-modules scripts/test-multi-user.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const localStorage = {};
Object.defineProperties(localStorage, {
  getItem: { value: key => localStorage[key] ?? null },
  setItem: { value: (key, value) => { localStorage[key] = String(value); } },
  removeItem: { value: key => { delete localStorage[key]; } }
});

async function openAccount(id, email) {
  let authChange;
  const redirects = [];
  const window = { location: { replace: url => redirects.push(url) } };
  const context = vm.createContext({ window, localStorage, console, crypto: { randomUUID } });
  const client = { auth: {
    getSession: async () => ({ data: { session: { user: { id, email } } } }),
    onAuthStateChange: fn => { authChange = fn; }
  } };
  const config = new vm.SyntheticModule(['supabase'], function () {
    this.setExport('supabase', client);
  }, { context });
  const workspace = new vm.SourceTextModule(fs.readFileSync('js/auth/user-workspace.js', 'utf8'), { context });
  await workspace.link(() => config);
  await workspace.evaluate();
  const db = new vm.SourceTextModule(fs.readFileSync('js/db.js', 'utf8'), { context });
  await db.link(() => workspace);
  await db.evaluate();
  return { storage: workspace.namespace.workspaceStorage, db: window.OpeningDB, context, authChange, redirects };
}

(async () => {
  localStorage.setItem('gm_opening_tree_local_v2', JSON.stringify([{ id: 'legacy', move: '1.e4' }]));
  const other = await openAccount('other', 'other@example.com');
  assert.equal(other.storage.getItem('gm_opening_tree_local_v2'), null);
  const owner = await openAccount('owner', 'bethuelsteven159@gmail.com');
  assert.equal((await owner.db.loadNodes())[0].id, 'legacy');
  await other.db.saveAllGames([{ id: 'other-game', pgn: '1. e4 *' }]);
  assert.equal((await other.db.loadGames())[0].id, 'other-game');
  assert.equal((await owner.db.loadGames()).length, 0);
  assert.ok(other.storage.getItem('gm_opening_tree_games_pending_sync_v1'));
  assert.equal(owner.storage.getItem('gm_opening_tree_games_pending_sync_v1'), null);
  const reopened = await openAccount('other', 'other@example.com');
  assert.equal((await reopened.db.loadGames())[0].id, 'other-game');
  owner.authChange('SIGNED_OUT', null);
  assert.throws(() => owner.storage.getItem('gm_opening_tree_local_v2'), /account changed/);
  assert.equal(owner.redirects[0], './login.html');

  // Verify owner filters and payloads for all remote collections.
  const source = fs.readFileSync('js/db.js', 'utf8');
  assert.equal((source.match(/\.select\("\*"\)\s*\.eq\("user_id", requireWorkspaceUserId\(\)\)/g) || []).length, 15);
  assert.equal((source.match(/user_id: requireWorkspaceUserId\(\)/g) || []).length, 3);
  assert.equal((source.match(/\.delete\(\)\.eq\("user_id", requireWorkspaceUserId\(\)\)/g) || []).length, 3);
  console.log('PASS: owner migration, account isolation, pending saves, returning user, sign-out guard, and remote ownership coverage.');
})().catch(error => { console.error(error); process.exitCode = 1; });
