const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const db = require("./db");
const bcrypt = require("bcrypt");

const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: "secretkey",
    resave: false,
    saveUninitialized: true
}));

// Middleware
function isLoggedIn(req, res, next) {
    if (!req.session.user) return res.redirect("/login");
    next();
}

// HOME PAGE (Read posts)
app.get("/", (req, res) => {
    db.all(`
        SELECT posts.*, users.username,
        (SELECT COUNT(*) FROM likes WHERE post_id = posts.id) AS like_count
        FROM posts
        JOIN users ON posts.user_id = users.id
        ORDER BY created_at DESC
    `, [], (err, posts) => {
        if (err) return res.status(500).send("Database error");

        const userId = req.session.user ? req.session.user.id : null;
        let userLikes = [];

        const renderPage = (userLikesArray) => {
            db.all(`
                SELECT comments.*, users.username 
                FROM comments 
                JOIN users ON comments.user_id = users.id
            `, [], (err, comments) => {
                if (err) return res.status(500).send("Database error");
                res.render("index", { posts, comments, user: req.session.user, userLikes: userLikesArray });
            });
        };

        if (userId) {
            db.all(
                "SELECT post_id FROM likes WHERE user_id = ?",
                [userId],
                (err, likeRows) => {
                    if (err) return res.status(500).send("Database error");
                    userLikes = likeRows.map(r => r.post_id);
                    renderPage(userLikes);
                }
            );
        } else {
            renderPage(userLikes);
        }
    });
});

// LOGIN PAGE
app.get("/login", (req, res) => {
    res.render("login");
});

// REGISTER (Create user)
app.post("/register", (req, res) => {
    const { username, password } = req.body;

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.send("Error hashing password");

        db.run(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            [username, hash],
            function(err) {
                if (err) return res.send("User already exists");
                res.redirect("/login");
            }
        );
    });
});

// LOGIN (Read user)
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE username = ?",
        [username],
        (err, user) => {
            if (user) {
                bcrypt.compare(password, user.password, (err, match) => {
                    if (match) {
                        req.session.user = user;
                        res.redirect("/");
                    } else {
                        res.send("Wrong login");
                    }
                });
            } else {
                res.send("Wrong login");
            }
        }
    );
});

// LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});

// CREATE POST
app.post("/post", isLoggedIn, (req, res) => {
    const content = req.body.content;
    const userId = req.session.user.id;

    db.run(
        "INSERT INTO posts (user_id, content) VALUES (?, ?)",
        [userId, content],
        () => res.redirect("/")
    );
});

// PROFILE (Read own posts)
app.get("/profile", isLoggedIn, (req, res) => {
    db.all(
        "SELECT * FROM posts WHERE user_id = ?",
        [req.session.user.id],
        (err, rows) => {
            res.render("profile", { posts: rows });
        }
    );
});

// UPDATE POST
app.post("/edit/:id", isLoggedIn, (req, res) => {
    db.run(
        "UPDATE posts SET content = ? WHERE id = ?",
        [req.body.content, req.params.id],
        () => res.redirect("/profile")
    );
});

// DELETE POST
app.post("/delete/:id", isLoggedIn, (req, res) => {
    db.run(
        "DELETE FROM posts WHERE id = ?",
        [req.params.id],
        () => res.redirect("/profile")
    );
});

// LIKE POST
app.post("/like/:postId", isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const postId = req.params.postId;

    const sendResponse = (count, liked) => {
        const isJson = req.get('Accept') && req.get('Accept').includes('application/json');
        if (isJson) {
            return res.json({ success: true, count, liked });
        }
        res.redirect("/");
    };

    // Prevent duplicate likes
    db.get(
        "SELECT * FROM likes WHERE user_id = ? AND post_id = ?",
        [userId, postId],
        (err, row) => {
            if (err) return res.status(500).json({ success: false, error: err.message });

            if (!row) {
                db.run(
                    "INSERT INTO likes (user_id, post_id) VALUES (?, ?)",
                    [userId, postId],
                    (err) => {
                        if (err) return res.status(500).json({ success: false, error: err.message });
                        db.get("SELECT COUNT(*) as count FROM likes WHERE post_id = ?", [postId], (err, countRow) => {
                            if (err) return res.status(500).json({ success: false, error: err.message });
                            sendResponse(countRow.count, true);
                        });
                    }
                );
            } else {
                db.run(
                    "DELETE FROM likes WHERE id = ?",
                    [row.id],
                    (err) => {
                        if (err) return res.status(500).json({ success: false, error: err.message });
                        db.get("SELECT COUNT(*) as count FROM likes WHERE post_id = ?", [postId], (err, countRow) => {
                            if (err) return res.status(500).json({ success: false, error: err.message });
                            sendResponse(countRow.count, false);
                        });
                    }
                );
            }
        }
    );
});

app.post("/comment/:postId", isLoggedIn, (req, res) => {
    const userId = req.session.user.id;
    const postId = req.params.postId;
    const content = req.body.content;

    const sendResponse = () => {
        const isJson = req.get('Accept') && req.get('Accept').includes('application/json');
        if (isJson) {
            return res.json({ success: true });
        }
        return res.redirect("/");
    };

    db.run(
        "INSERT INTO comments (user_id, post_id, content) VALUES (?, ?, ?)",
        [userId, postId, content],
        (err) => {
            if (err) {
                if (req.get('Accept') && req.get('Accept').includes('application/json')) {
                    return res.status(500).json({ success: false, error: err.message });
                }
                return res.status(500).send("Database error");
            }

            // mention detection
            const mentions = content.match(/@(\w+)/g);

            if (mentions) {
                mentions.forEach(tag => {
                    const username = tag.substring(1);

                    db.get(
                        "SELECT id FROM users WHERE username = ?",
                        [username],
                        (err, user) => {
                            if (user) {
                                db.run(
                                    "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
                                    [
                                        user.id,
                                        `You were mentioned in: "${content}"`
                                    ]
                                );
                            }
                        }
                    );
                });
            }

            sendResponse();
        }
    );
});


app.get("/notifications", isLoggedIn, (req, res) => {
    const userId = req.session.user.id;

    db.all(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
        [userId],
        (err, notifications) => {

            if (err) {
                console.log(err);
                return res.send("Database error");
            }

            console.log(notifications); // debug

            res.render("notifications", { notifications });
        }
    );
});

app.get('/notifications/unread-count', (req, res) => {
    if (!req.session.user) {
        return res.json({ count: 0 });
    }
    
    const userId = req.session.user.id;

    db.get(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`,
    [userId],
    (err, row) => {
        if (err) return res.status(500).send(err);

        res.json({ count: row.count });
    }
    );
});


app.post('/notifications/mark-read', isLoggedIn, (req, res) => {
    const userId = req.session.user.id;

    db.run(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ?`,
    [userId],
    function (err) {
        if (err) return res.status(500).send(err);
        res.sendStatus(200);
    }
    );
});

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
    cb(null, 'uploads/'); // folder where files are saved
    },
    filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|webm/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (ext) {
    cb(null, true);
    } else {
    cb(new Error('Only images, gifs, and videos allowed'));
    }
};

const upload = multer({ storage, fileFilter });

app.post('/posts', isLoggedIn, upload.single('media'), (req, res) => {
    const userId = req.session.user.id;
    const content = req.body.content;

    let mediaPath = null;

    if (req.file) {
    mediaPath = '/uploads/' + req.file.filename;
    }

    db.run(
    `INSERT INTO posts (user_id, content, media_path) VALUES (?, ?, ?)`,
    [userId, content, mediaPath],
    function (err) {
        if (err) return res.status(500).send(err);
      res.redirect('/'); // or send JSON
    }
    );
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
