const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

db.serialize(() => {
  db.all('SELECT COUNT(*) AS count FROM likes', (err, rows) => {
    console.log('likes count', err ? err.message : rows[0].count);
  });
  db.all('SELECT id, user_id, post_id FROM likes LIMIT 10', (err, rows) => {
    console.log('likes rows', err ? err.message : JSON.stringify(rows));
  });
  db.all('SELECT COUNT(*) AS count FROM posts', (err, rows) => {
    console.log('posts count', err ? err.message : rows[0].count);
  });
  db.all('SELECT id, user_id, content FROM posts LIMIT 5', (err, rows) => {
    console.log('posts rows', err ? err.message : JSON.stringify(rows));
  });
  db.all('SELECT id, username, profile_name, profile_picture FROM users LIMIT 5', (err, rows) => {
    console.log('users rows', err ? err.message : JSON.stringify(rows));
  });
});

db.close();
