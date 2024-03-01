const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('express-flash');
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const User = require("./models/userModel");
const Blog = require("./models/blogModel");
const path = require('path');

require("dotenv").config();

const app = express();

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: false }));

app.use(bodyParser.json());

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/blogDB', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("Error connecting to MongoDB:", err));

passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
        try {
            const user = await User.findOne({ email });
            if (!user) {
                return done(null, false, { message: "No user with that email address" });
            }
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) {
                    return done(err);
                }
                if (isMatch) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: "Password is incorrect" });
                }
            });
        } catch (error) {
            return done(error);
        }
    })
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
      .then(user => {
          done(null, user);
      })
      .catch(error => {
          done(error);
      });
});

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isAdmin) {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Only admin can perform this action' });
};

const isUser = (req, res, next) => {
    if (req.isAuthenticated() && !req.user.isAdmin) {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Regular users cannot perform this action' });
};

app.post('/blog', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { title, body } = req.body; 
        const author = req.user._id; 
        const blog = await Blog.create({ title, body, author }); 
        res.status(201).json(blog); 
    } catch (error) {
        if (error.name === 'ValidationError') {
            const validationErrors = {};
            for (const field in error.errors) {
                validationErrors[field] = error.errors[field].message;
            }
            res.status(400).json({ message: 'Validation failed', errors: validationErrors });
        } else {
            res.status(500).json({ message: error.message });
        }
    }
});

app.put('/blog/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findByIdAndUpdate(id, req.body, { new: true });
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.delete('/blog/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findByIdAndDelete(id);
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/blog', async (req, res) => {
    try {
        const blogs = await Blog.find({});
        res.status(200).json(blogs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/blog/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findById(id);
        if (!blog) {
            return res.status(404).json({ message: 'Blog not found' });
        }
        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get("/welcome", async (req, res) => {
    try {
        const blogs = await Blog.find({}); 
        res.render("welcome", { user: req.user, blogs: blogs }); 
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

app.get("/", (req, res) => {
    res.render("index");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true
}), (req, res) => {
    if (req.user.isAdmin) {
        res.redirect("/welcome");
    } else {
        res.redirect("/welcomeUser");
    }
});

app.get("/welcomeUser", isAuthenticated, async (req, res) => {
    try {
        const blogs = await Blog.find({}); 
        res.render("welcomeUser", { user: req.user, blogs: blogs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({
            name,
            email,
            password: hashedPassword,
            isAdmin: false 
        });
        await user.save();
        res.redirect("/login");
    } catch (error) {
        console.error(error);
        res.redirect("/register");
    }
});

app.get('/logout', (req, res) => {
    req.logout(function(err) {
        if (err) {
            console.error(err);
            return next(err);
        }
        res.redirect('/');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
