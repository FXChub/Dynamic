const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./database.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Tables:', rows);
  }
  db.close();
});
