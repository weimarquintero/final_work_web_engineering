var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var mongoose = require("mongoose");
var passport = require("passport");
var LocalStrategy = require("passport-local");
var multer = require("multer");
var pdfDocument = require('pdfkit');
var fs = require('fs');

var Machine = require("./models/machine");
var Sale = require("./models/sale");
var User = require("./models/user");

var storage = multer.diskStorage({
    destination: (req, file, callBack)=>{
        callBack(null, './uploads/');
    },
    filename: (req, file, callBack)=>{
        callBack(null, file.originalname);
    }
});

var fileFilter = (req, file, callBack)=>{
    //reject a file
    if(file.mimetype === 'image/jpg' || file.mimetype === 'application/pdf' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/png' || file.mimetype === 'image/svg'){
        callBack(null, true);
    }else{
        callBack(null, false);
    }
}
var upload = multer({
    storage:storage,
    fileFilter: fileFilter
    });


mongoose.connect("mongodb://localhost/confection_machines_store", { useUnifiedTopology: true, useNewUrlParser: true });
app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use('/uploads',express.static('uploads'));

//PASSPORT CONFIGURATION
app.use(require("express-session")({
    secret: "we are the best group in the class",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next)=>{
    res.locals.currentUser = req.user;
    next();
});

//ROUTES

app.get("/", (req, res)=>{
    res.render("landing");
});

//---------------------INVENTORY--------------------------------------

//INDEX ROUTE FOR THE INVENTORY
app.get("/machines", (req, res)=>{
    //get all machines from de DB
    Machine.find({}, (err, machines)=>{
        if(err){
            console.log(err);
        }else{
            //render all the machines in the template
            res.render("inventory/index", {machines:machines})
        }
    });
});

//CREATE ROUTE OR THE INVENTORY--ADD NEW MACHINE
app.post("/machines", isLoggedIn, upload.fields([{name: 'image', maxCount: 1},{name: 'purchase_receipt', maxCount: 1}]),(req, res)=>{
    //get data from form and add to machines array
    var today = new Date();
    var brand = req.body.brand;
    var state = req.body.state;
    var model = req.body.model;
    var location = req.body.location;
    var purchase_price = req.body.purchase_price;
    var purchase_receipt = req.files.purchase_receipt[0].path;
    var image = req.files.image[0].path;
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
    var creation_date = new Date(date);
    creation_date.setDate(creation_date.getDate());
    var sale_date = req.body.sale_date;
    var seller = req.body.seller;
    var quantity = req.body.quantity;
    var newMachine = {state:state, brand:brand, quantity:quantity, image: image, model:model, location:location, purchase_price:purchase_price, creation_date:creation_date, sale_date: sale_date, seller:seller, purchase_receipt:purchase_receipt};
    // Create a new machine and save to DB
    Machine.create(newMachine, (err, machine)=>{
        if(err){
            console.log(err);
        }else{
            //redirect back to machines page
            res.redirect("/machines");
        }
    });
});

//GENERATE PDF METHOD AS A PROMISE
function generatePDF(){
//initialize a pdf document
    var doc = new pdfDocument();
    //save the pdf file in a root directory
    doc.pipe(fs.createWriteStream('./uploads/pdfs/report.pdf'));
    //get all the machines from db in the last month
    var date = new Date();
    date.setMonth(date.getMonth() - 1);
    Machine.find({creation_date: {$gte:date}},(err, machines)=>{
        //setting a title for the pdf
        doc.text("Last month inventory Report", {align: 'center'});
        //add the information of the machines
        machines.forEach(machine => {
            //add margins to the document
            doc.image(machine.image, {
                fit: [500, 200],
                align: 'center'
            });
            doc.text("BRAND: "+machine.brand);
            doc.text("MODEL: "+machine.model);
            doc.text("STORE: "+machine.location);
            doc.text("PURCHASE PRICE: "+machine.purchase_price);
            doc.text("CREATION DATE: "+machine.creation_date.toDateString());
            doc.text("SELLER: "+machine.seller);
            doc.text("QUANTITY: "+machine.quantity);
            doc.text("STATE: "+machine.state);
            doc.fillColor('blue').text("PURCHASE RECEIPT",{link: '/'+machine.purchase_receipt, underline: true, continued: false});
            doc.moveDown();
            doc.addPage({margin: 50}).text("Last month inventory Report", {align: 'center'});
        });
        //Finalize PDF file
        doc.end();
    });
};

//open the pdf Report
app.get('/machines/generatePdf', isLoggedIn, (req, res)=>{
    generatePDF();
    res.redirect('/uploads/pdfs/report.pdf');
});

//NEW-- SHOW FORM TO CREATE A NEW MACHINE
app.get("/machines/new", isLoggedIn, (req, res)=>{
    res.render("inventory/new");
});

//SWOW-- SHOWS MORE INFO ABOUT A MACHINE
app.get("/machines/:id", isLoggedIn, (req, res)=>{
    //find the machine with provided ID
    Machine.findById(req.params.id, (err, foundMachine)=>{
        if(err){
            console.log(err);
        }
        else{
            //render the show template
            res.render("inventory/show_machine", {machine:foundMachine});
        }
    });
});

//===========
//AUTH ROUTES
//===========

//show the register form
app.get("/register", (req, res)=>{
    res.render("register");
});

//handle sign up logic!
app.post("/register",upload.single('user_image'), (req, res)=>{
    var newUser = new User({
        username: req.body.username,
        name: req.body.name,
        age: req.body.age,
        email: req.body.email,
        contract: {charge: req.body.charge, 
                   salary: req.body.salary, 
                   start_date: req.body.start_date, 
                   due_date: req.body.due_date, 
                   workplace: req.body.workplace},
        user_image: req.file.path
    });
    User.register(newUser, req.body.password, (err, user)=>{
        if(err){
            console.log(err);
            return res.render("register");
        }
        passport.authenticate("local")(req, res, ()=>{
            res.redirect("/machines");
            console.log(req.file);
        });
    });
});

//show login form
app.get("/login", (req, res)=>{
    res.render("login");
});

//handling login logic
app.post("/login", passport.authenticate("local", {successRedirect: "/machines", failureRedirect: "/login"}), (req, res)=>{
    res.send("login logic happens here!");
});

//logout route
app.get("/logout", (req, res)=>{
    req.logout();
    res.redirect("/machines");
});

function isLoggedIn(req, res, next){
    if(req.isAuthenticated()){
        return next();
    }
    res.redirect("/login");
}

app.listen(3002, ()=>{
    console.log("confection machines server runnin at port 3002");
});