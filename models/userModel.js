import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username: {
        required: true,
        type: String,
        unique: true,
        maxLength: 25,
    },
    email: {
        required: true,
        type: String,
        unique: true,
        maxLength: 25,
        lowercase: true,
        match: /^\S+@\S+\.\S+$/,
    },
    phone: {
        required: true,
        type: Number,
        minLength: 10,
        maxLength: 10,
    },
    profile: {
        type: String
    },
    address: [
        {
            pin: {
                type: Number,
            },
            state: {
                type: String,
            },
            city: {
                type: String,
            },
            building: {
                type: String,
            },
            area: {
                type: String,
            },
        },
    ],
    wishlist: [
        { type: mongoose.Types.ObjectId, ref: 'Product' }
    ],
    cart: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
            },
            quantity: {
                type: Number,
                default: 1
            },
        },
    ],
    orders: [
        {
            order_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Order',
            },
            order_date: {
                type: Date,
                default: Date.now,
            },
            products: [
                {
                    product_id: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'Product',
                    },
                    name: String,
                    price: Number,
                    quantity: Number,
                },
            ],
            total_amount: Number,
        },
    ],
    password: {
        required: true,
        type: String,
        minLength: 6,
    },
    verified: {
        type: Boolean,
        default: false
    },
    blocked: {
        type: Boolean,
        default: false
    }
});

const User = mongoose.model("User", userSchema);

export default User;