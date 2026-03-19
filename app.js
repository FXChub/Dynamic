const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const db = require("./db");

const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

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
        SELECT posts.*, users.username 
        FROM posts 
        JOIN users ON posts.user_id = users.id
        ORDER BY created_at DESC
    `, [], (err, rows) => {
        res.render("index", { posts: rows, user: req.session.user });
    });
});

// LOGIN PAGE
app.get("/login", (req, res) => {
    res.render("login");
});

// REGISTER (Create user)
app.post("/register", (req, res) => {
    const { username, password } = req.body;

    db.run(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, password],
        function(err) {
            if (err) return res.send("User already exists");
            res.redirect("/login");
        }
    );
});

// LOGIN (Read user)
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE username = ? AND password = ?",
        [username, password],
        (err, user) => {
            if (user) {
                req.session.user = user;
                res.redirect("/");
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

app.listen(3000, () => console.log("Server running on http://localhost:3000"));