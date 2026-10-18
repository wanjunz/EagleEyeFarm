const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveProjectDir } = require('../js/project_folders');

test('deleting a field only ever targets one folder inside projects/', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-'));
    fs.mkdirSync(path.join(root, 'My Field'));
    fs.writeFileSync(path.join(root, 'notes.txt'), 'x');
    assert.strictEqual(resolveProjectDir(root, 'My Field'), path.join(root, 'My Field'));
    for (const bad of ['', ' ', '.', '..', '../etc', 'a/b', 'a\\b', null, undefined]) {
        assert.throws(() => resolveProjectDir(root, bad), /Not a valid field name/, String(bad));
    }
    assert.throws(() => resolveProjectDir(root, 'missing'), /was not found/);
    assert.throws(() => resolveProjectDir(root, 'notes.txt'), /was not found/, 'files are not fields');
});
