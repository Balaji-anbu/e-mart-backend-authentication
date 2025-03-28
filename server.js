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
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI, {
  // Connection options can be added here
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => {
  console.error("❌ MongoDB Connection Failed:", err);
  process.exit(1); // Exit if database connection fails
});

// ===== SCHEMAS & MODELS =====

// User Schema & Model
const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    requird: true,
  },
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
  mobile: { 
    type: String 
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
const cartSchema = new mongoose.Schema({
  userId: {
    type: String, // Custom userId (e.g., "EGM-CUST-10001")
    ref: 'users',  // Reference User collection
    required: false
  },
  items: [{
    userId:{
      type: String,
      ref: 'users.userId',
      req: true
    },
    productId: {
      type: String, // Product ID as String
      required: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1
    },
    price: {
      type: Number,
      required: true
    }
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});


const productSchema = new mongoose.Schema({
    productId: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    discountedPrice: {
      type: Number,
      min: 0
    },
    category: {
      type: String,
      required: true
    },
    images: [String],
    mainImage: {
      type: String,
      required: true
    },
    inStock: {
      type: Boolean,
      default: true
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0
    },
   
   
    updatedAt: {
      type: Date,
      default: Date.now
    }
  });
  
  // Add text index for search capabilities
  productSchema.index({ name: 'text', description: 'text', tags: 'text' });
  
  // Before saving, update the updatedAt field
  productSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
  });
  
  // Initialize Product model
  const Product = mongoose.model("Product", productSchema);
  





// JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET;

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

  // ===== PRODUCT ROUTES =====

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
});

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    quantity: {
      type: Number,
      required: true
    },
    price: {
      type: Number,
      required: true
    }
  }],
  totalPrice: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  orderDate: { 
    type: Date, 
    default: Date.now 
  },
  shippingAddress: {
    type: String
  }
});

// Initialize models
const User = mongoose.model("User", userSchema);
const Cart = mongoose.model("Cart", cartSchema);
const Wishlist = mongoose.model("Wishlist", wishlistSchema);
const Order = mongoose.model("Order", orderSchema);
 const Product = mongoose.model("Product", productSchema);

// ===== MIDDLEWARE =====

// JWT Secret Key
const JWT_SECRET = process.env.JWT_SECRET;

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

// ==== AUTH ROUTES ====

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

    // Generate unique user ID
    const lastUser = await User.findOne().sort({ userId: -1 }); // Get the last user by userId
    let newUserId = 10001; // Start from 10001
    
    if (lastUser && lastUser.userId) {
      const lastUserIdNumber = parseInt(lastUser.userId.replace("EGM-CUST-", ""));
      newUserId = lastUserIdNumber + 1;
    }

    const uniqueUserId = `EGM-CUST-${newUserId}`;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const newUser = new User({
      userId: uniqueUserId,
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: "✅ User registered successfully!",
      userId: uniqueUserId
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
      { id: user._id, email: user.email, username: user.username },
      JWT_SECRET,
      { expiresIn: "24d" }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        userId: user.userId,
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

// ==== USER ROUTES ====

// Get User Profile
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

// Update User Phone Number
app.post("/add-phone", verifyToken, async (req, res) => {
  try {
    const { mobile } = req.body;

    // Update user's mobile number
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { mobile },
      { new: true, select: "-password" } // Exclude password from response
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      message: "✅ Mobile number updated successfully!",
      user: updatedUser
    });

  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ success: false, message: "Error updating profile" });
  }
});

// ==== CART ROUTES ====
// Add item to cart
app.post('/add-to-cart', verifyToken, async (req, res) => {
  try {
    const { productId, quantity, price } = req.body;
    const userId = req.user.userId; // Get the custom userId (e.g., "EGM-CUST-10001")

    if (!productId || !quantity || !price) {
      return res.status(400).json({ 
        success: false, 
        message: "Product ID, quantity, and price are required" 
      });
    }

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check if the product already exists in the cart
    const existingItemIndex = cart.items.findIndex(item => item.productId === productId);
    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({userId, productId, quantity, price });
    }

    cart.updatedAt = Date.now();
    await cart.save();

    // Fetch the updated cart with user details
    const updatedCart = await Cart.findById(cart._id).populate({
      path: 'userId',
      select: 'userId username email mobile', // Fetch specific fields
      model: 'User'
    });

    res.status(200).json({
      success: true,
      message: "Item added to cart successfully",
      cart: updatedCart
    });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({
      success: false,
      message: "Error adding item to cart"
    });
  }
});


// Retrieve cart items
app.get('/get-cart', verifyToken, async (req, res) => {
  try {
    // Use the correct model name (Cart instead of cart)
    const cart = await Cart.findOne({ userId: req.user.id }).populate('items.productId');

    if (!cart) {
      return res.json({
        success: true,
        message: "Cart is empty",
        cart: { userId: req.user.id, items: [] } // Fixed `req.users.userId` to `req.user.id`
      });
    }

    res.status(200).json({
      success: true,
      cart
    });
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({
      success: false,
      message: "Error retrieving cart"
    });
  }
});

// Update cart item quantity
app.post('/update-cart', verifyToken, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.id;

    if (!productId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product ID and quantity are required"
      });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found"
      });
    }

    const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart"
      });
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      cart.items.splice(itemIndex, 1);
    } else {
      // Update quantity
      cart.items[itemIndex].quantity = quantity;
    }

    cart.updatedAt = Date.now();
    await cart.save();

    res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cart
    });
  } catch (err) {
    console.error("Update cart error:", err);
    res.status(500).json({
      success: false,
      message: "Error updating cart"
    });
  }
});

// Remove item from cart
app.delete('/remove-from-cart/:productId', verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found"
      });
    }

    const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart"
      });
    }

    cart.items.splice(itemIndex, 1);
    cart.updatedAt = Date.now();
    await cart.save();

    res.status(200).json({
      success: true,
      message: "Item removed from cart successfully",
      cart
    });
  } catch (err) {
    console.error("Remove from cart error:", err);
    res.status(500).json({
      success: false,
      message: "Error removing item from cart"
    });
  }
});

// Clear cart
app.delete('/clear-cart', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found"
      });
    }

    cart.items = [];
    cart.updatedAt = Date.now();
    await cart.save();

    res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
      cart
    });
  } catch (err) {
    console.error("Clear cart error:", err);
    res.status(500).json({
      success: false,
      message: "Error clearing cart"
    });
  }
});

// ==== WISHLIST ROUTES ====

// Add item to wishlist
app.post('/add-to-wishlist', verifyToken, async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required"
      });
    }

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [] });
    }

    if (!wishlist.items.some(item => item.productId.toString() === productId)) {
      wishlist.items.push({ productId, addedAt: Date.now() });
      await wishlist.save();
      
      res.status(200).json({
        success: true,
        message: "Item added to wishlist",
        wishlist
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Item already in wishlist"
      });
    }
  } catch (err) {
    console.error("Add to wishlist error:", err);
    res.status(500).json({
      success: false,
      message: "Error adding item to wishlist"
    });
  }
});

// Retrieve wishlist items
app.get('/get-wishlist', verifyToken, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).populate('items.productId');
    
    if (!wishlist) {
      return res.json({
        success: true,
        message: "Wishlist is empty",
        wishlist: { userId: req.user.id, items: [] }
      });
    }
    
    res.status(200).json({
      success: true,
      wishlist
    });
  } catch (err) {
    console.error("Get wishlist error:", err);
    res.status(500).json({
      success: false,
      message: "Error retrieving wishlist"
    });
  }
});

// Remove item from wishlist
app.delete('/remove-from-wishlist/:productId', verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: "Wishlist not found"
      });
    }

    const itemIndex = wishlist.items.findIndex(item => item.productId.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in wishlist"
      });
    }

    wishlist.items.splice(itemIndex, 1);
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: "Item removed from wishlist successfully",
      wishlist
    });
  } catch (err) {
    console.error("Remove from wishlist error:", err);
    res.status(500).json({
      success: false,
      message: "Error removing item from wishlist"
    });
  }
});

// Clear wishlist
app.delete('/clear-wishlist', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: "Wishlist not found"
      });
    }

    wishlist.items = [];
    await wishlist.save();

    res.status(200).json({
      success: true,
      message: "Wishlist cleared successfully",
      wishlist
    });
  } catch (err) {
    console.error("Clear wishlist error:", err);
    res.status(500).json({
      success: false,
      message: "Error clearing wishlist"
    });
  }
});

// ==== ORDER ROUTES ====

// Place an order
app.post('/place-order', verifyToken, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    const userId = req.user.id;

    if (!items || !items.length) {
      return res.status(400).json({
        success: false,
        message: "Order items are required"
      });
    }

    // Calculate total price
    const totalPrice = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    const order = new Order({
      userId,
      items,
      totalPrice,
      shippingAddress,
      status: 'pending'
    });
    
    await order.save();

    // Optionally clear the cart after placing order
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [], updatedAt: Date.now() } }
    );

    res.status(200).json({
      success: true,
      message: "Order placed successfully",
      order
    });
  } catch (err) {
    console.error("Place order error:", err);
    res.status(500).json({
      success: false,
      message: "Error placing order"
    });
  }
});

// Get user's orders
app.get('/get-orders', verifyToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id })
      .populate('items.productId')
      .sort({ orderDate: -1 }); // Most recent orders first
    
    res.status(200).json({
      success: true,
      orders
    });
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({
      success: false,
      message: "Error retrieving orders"
    });
  }
});

// Get order details
app.get('/order/:orderId', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: orderId, userId })
      .populate('items.productId');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }
    
    res.status(200).json({
      success: true,
      order
    });
  } catch (err) {
    console.error("Get order details error:", err);
    res.status(500).json({
      success: false,
      message: "Error retrieving order details"
    });
  }
});

// Cancel order
app.post('/cancel-order/:orderId', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Only allow cancellation if order is pending or processing
    if (order.status !== 'pending' && order.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order in ${order.status} status`
      });
    }

    order.status = 'cancelled';
    await order.save();

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order
    });
  } catch (err) {
    console.error("Cancel order error:", err);
    res.status(500).json({
      success: false,
      message: "Error cancelling order"
    });
  }
});



  // Get all products with pagination, filtering, and sorting
  app.get("/products", verifyToken, async (req, res) => {
    try {
      // Parsing query parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 1000;
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
// ===== ERROR HANDLING =====

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
