require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const bodyParser = require("body-parser");

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(cors({
  origin: '*', // In production, replace with your Flutter app's domain
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => {
  console.error("❌ MongoDB Connection Failed:", err);
  process.exit(1); // Exit if database connection fails
});

// JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET;

// ===== USER SCHEMA & MODEL =====
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", UserSchema);

// ===== PRODUCT SCHEMA & MODEL =====
const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true
  },
  productName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true
  },
  badge: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  variants: [
    {
      SKU: {
        type: String,
        required: true,
        unique: true
      },
      dealerPrice: {
        type: Number,
        required: true,
        min: 0
      },
      specialPrice: {
        type: Number,
        min: 0
      },
      MRP: {
        type: Number,
        required: true,
        min: 0
      },
      imageUrl: {
        type: String,
        required: true
      },
      inStock: {
        type: Boolean,
        default: true
      }
    }
  ]
});


// Add text index for search capabilities
productSchema.index({ name: 'text', description: 'text' });

// Before saving, update the updatedAt field
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Initialize Product model
const Product = mongoose.model("Product", productSchema);

// ===== MIDDLEWARE =====

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "") || req.header("Authorization");
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: "Access denied. No token provided." 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ 
      success: false, 
      message: "Invalid token." 
    });
  }
};

// ===== ROUTES =====

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date(),
    service: 'e-mart-backend'
  });
});

// ===== AUTH ROUTES =====

// Register API
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide all required fields" 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "User with this email already exists" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: "✅ User registered successfully!"
    });

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during registration" 
    });
  }
});

// Login API
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide email and password" 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid email or password" 
      });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during login" 
    });
  }
});

// Protected Profile API
app.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.json({
      success: true,
      user
    });
    
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching profile" 
    });
  }
});

// JWT Product Token Generation Endpoint
app.post("/get-product-token", verifyToken, async (req, res) => {
  try {
    // Generate a new product-specific token with appropriate permissions
    const productTokenPayload = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role || 'user',
      permissions: ['read:products'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
    };
    
    // Generate the product token
    const productToken = jwt.sign(productTokenPayload, JWT_SECRET);
    
    // Return the new token
    return res.status(200).json({
      success: true,
      token: productToken,
      expiresIn: 3600 // seconds
    });
      
  } catch (error) {
    console.error("Product token generation error:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating product token"
    });
  }
});

// ===== PRODUCT ROUTES =====

// Get all products with pagination, filtering, and sorting
app.get("/products", verifyToken, async (req, res) => {
  try {
    // Parsing query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1100;
    const skip = (page - 1) * limit;
    
    // Filter parameters
    const category = req.query.category;
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined;
    const inStock = req.query.inStock === 'true' ? true : undefined;
    const search = req.query.search;
    
    // Sorting
    const sortField = req.query.sortField || 'productId';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    
    // Build filter object
    const filter = {};
    
    if (category) filter.category = category;
    if (inStock !== undefined) filter.inStock = inStock;
    
    // Price range
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = minPrice;
      if (maxPrice !== undefined) filter.price.$lte = maxPrice;
    }
    
    // Text search
    if (search) {
      filter.$text = { $search: search };
    }
    
    // Execute query with pagination and sorting
    const products = await Product.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const totalProducts = await Product.countDocuments(filter);
    
    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
      products
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving products"
    });
  }
});

// Get product by ID
app.get("/products/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Try to find by custom productId first (EGM-PROD-XXXX)
    let product = await Product.findOne({ productId });
    
    // If not found, try to find by MongoDB _id
    if (!product && mongoose.Types.ObjectId.isValid(productId)) {
      product = await Product.findById(productId);
    }
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    
    res.json({
      success: true,
      product
    });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving product"
    });
  }
});

// Update product (Admin only) - In a real app, add admin middleware
app.put("/products/:productId", verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.productId;
    delete updateData.createdAt;
    
    // Set updatedAt timestamp
    updateData.updatedAt = Date.now();
    
    // Find and update the product
    const product = await Product.findOneAndUpdate(
      { productId },
      { $set: updateData },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    
    res.json({
      success: true,
      message: "Product updated successfully",
      product
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating product"
    });
  }
});

// Delete product (Admin only) - In a real app, add admin middleware
app.delete("/products/:productId", verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findOneAndDelete({ productId });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    
    res.json({
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting product"
    });
  }
});

// Get products by category
app.get("/category/:category/products", async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const products = await Product.find({ category })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const totalProducts = await Product.countDocuments({ category });
    
    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
      products
    });
  } catch (error) {
    console.error("Get products by category error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving products by category"
    });
  }
});

// Search products
app.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }
    
    const products = await Product.find(
      { $text: { $search: q } },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .skip(skip)
      .limit(limit);
    
    const totalProducts = await Product.countDocuments({ $text: { $search: q } });
    
    res.json({
      success: true,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit),
      totalProducts,
      products
    });
  } catch (error) {
    console.error("Search products error:", error);
    res.status(500).json({
      success: false,
      message: "Error searching products"
    });
  }
});

// Get featured products (products with highest ratings)
app.get("/featured-products", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const products = await Product.find({ inStock: true })
      .sort({ "ratings.average": -1, "ratings.count": -1 })
      .limit(limit);
    
    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error("Get featured products error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving featured products"
    });
  }
});

// Get new arrivals (most recently added products)
app.get("/new-arrivals", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const products = await Product.find({ inStock: true })
      .sort({ createdAt: -1 })
      .limit(limit);
    
    res.json({
      success: true,
      products
    });
  } catch (error) {
    console.error("Get new arrivals error:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving new arrivals"
    });
  }
});

// Add product rating and review (requires authentication)
app.post("/products/:productId/rate", verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, review } = req.body;
    const userId = req.user.id;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5"
      });
    }
    
    // Get the product
    const product = await Product.findOne({ productId });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }
    
    // Update product's average rating
    const newCount = product.ratings.count + 1;
    const newAverage = ((product.ratings.average * product.ratings.count) + rating) / newCount;
    
    product.ratings = {
      average: parseFloat(newAverage.toFixed(1)),
      count: newCount
    };
    
    await product.save();
    
    // In a production app, you would save the review to a separate collection
    // with a reference to both the product and user
    
    res.json({
      success: true,
      message: "Rating submitted successfully",
      newRating: product.ratings
    });
  } catch (error) {
    console.error("Rate product error:", error);
    res.status(500).json({
      success: false,
      message: "Error rating product"
    });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!' 
  });
});

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
