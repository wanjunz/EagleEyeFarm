// Safe lookup of a project folder by name (used before deleting one).

const fs = require('fs');
const path = require('path');

/**
 * Full path of projects/<folder>, or throws if the name could point anywhere else
 * (empty, '.', '..', slashes) or the folder does not exist.
 */
function resolveProjectDir(projectsDir, folder) {
    const name = String(folder == null ? '' : folder);
    if (!name.trim() || name === '.' || name === '..' || /[\\/]/.test(name) || name.includes('\0')) {
        throw new Error('Not a valid field name: "' + name + '"');
    }
    const root = path.resolve(projectsDir);
    const dir = path.resolve(root, name);
    if (path.dirname(dir) !== root) throw new Error('Not a valid field name: "' + name + '"');
    if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) throw new Error('Field "' + name + '" was not found.');
    return dir;
}

/** Main process: 'eagleeye:trash-project' moves projects/<folder> to the Trash (recoverable). */
function registerTrashHandler(ipcMain, shell, projectsDir) {
    ipcMain.handle('eagleeye:trash-project', async (event, folder) => {
        await shell.trashItem(resolveProjectDir(projectsDir, folder));
        return true;
    });
}

module.exports = { resolveProjectDir, registerTrashHandler };
