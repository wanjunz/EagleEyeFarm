// main js file
const {app, BrowserWindow, dialog, ipcMain} = require('electron');

// Native folder picker for EXPORT PROJECT (renderer pages cannot open dialogs themselves).
ipcMain.handle('cofly:choose-export-folder', async (event) => {
	const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
		title: 'Choose where to save the exported project',
		properties: ['openDirectory', 'createDirectory']
	});
	return result.canceled ? null : result.filePaths[0];
});

// Single photo picker (the what3words photo).
ipcMain.handle('cofly:choose-file', async (event, title) => {
	const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
		title: title || 'Choose a photo',
		properties: ['openFile'],
		filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'JPG', 'JPEG', 'png'] }]
	});
	return result.canceled ? null : result.filePaths[0];
});

// Folder picker for importing Atom 2 photos (SD card DCIM folder or a downloaded folder).
ipcMain.handle('cofly:choose-folder', async (event, title) => {
	const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
		title: title || 'Choose a folder',
		properties: ['openDirectory']
	});
	return result.canceled ? null : result.filePaths[0];
});
const path = require('path');
const url = require('url');
// hide warning on console log
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = true;
//init win
let win;

function createWindow(){
	// create nrpswer window
	win = new BrowserWindow({width:1280,height:800,minWidth:960,minHeight:600,title:'Eagle Eye',icon:path.join(__dirname,'img','brand','app-icon.png'),webPreferences:{webSecurity: false,nodeIntegration: true,contextIsolation: false}});

	// load index.html
	win.loadURL(url.format({
		pathname: path.join(__dirname, 'index.html'),
		protocol: 'file:',
		slashes: true
	}));

	//win.setMenu(null);

	// OPen devtool

	//win.webContents.openDevTools();

	win.on('closed',() =>{

		win = null;

	});
}

    


// Run crete window function 
app.setName('Eagle Eye');
app.on('ready', function() {
	// Eagle Eye logo in the macOS Dock (Windows/Linux use the window icon above)
	if (process.platform === 'darwin' && app.dock) app.dock.setIcon(path.join(__dirname, 'img', 'brand', 'app-icon.png'));
	createWindow();
});


// Quit when all windows are closed

app.on('window-all-cloed',() =>{

	if(process.platform !== 'darwin'){
		app.quit();
	}
});
