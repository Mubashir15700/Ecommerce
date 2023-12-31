import mongoose from "mongoose";
import Product from "../../models/productModel.js";
import Address from "../../models/addressModel.js";
import UserOTPVerification from "../../models/userOTPModel.js";
import { sendToMail } from '../utils/sendMail.js';
import { isLoggedIn, getCurrentUser } from '../getCurrentUser.js';

export const getCart = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req, res);
        if (currentUser.verified) {
            await currentUser.populate('cart.product');
            await currentUser.populate('cart.product.category');
            const cartProducts = currentUser.cart;
            const grandTotal = cartProducts.reduce((total, element) => {
                return total + (element.quantity * element.product.actualPrice);
            }, 0);
            res.render("customer/cart", {
                isLoggedIn: isLoggedIn(req, res),
                currentUser,
                cartProducts,
                grandTotal,
                insufficientStockProduct: '',
                activePage: 'Cart',
            });
        } else {
            await UserOTPVerification.deleteMany({ userId: currentUser._id });
            req.body.email = currentUser.email;
            sendToMail(req, res, currentUser._id, false);
        }
    } catch (error) {
        next(error);
    }
};

export const addToCart = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req, res);
        const { product, hiddenQuantity } = req.body;

        const existingCartItem = currentUser.cart.find(item => item.product.toString() === product);

        if (existingCartItem) {
            existingCartItem.quantity += parseInt(hiddenQuantity);
        } else {
            const cartItem = {
                product,
                quantity: parseInt(hiddenQuantity),
            };
            currentUser.cart.push(cartItem);
        }
        await currentUser.save();

        if (req.body.from) {
            res.redirect("/wishlist");
        } else {
            res.redirect("/shop/1");
        }
    } catch (error) {
        next(error);
    }
};

export const removeFromCart = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req, res);
        const cartItemIndex = currentUser.cart.findIndex(item => item._id.toString() === req.params.id);

        currentUser.cart.splice(cartItemIndex, 1);
        await currentUser.save();

        res.redirect("/cart");
    } catch (error) {
        next(error);
    }
};

export const updateCart = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req, res);
        const cartItem = currentUser.cart.find(item => item._id.equals(new mongoose.Types.ObjectId(req.params.id)));
        if (cartItem) {
            const product = await Product.findById(cartItem.product);

            if (req.body.type === "increment") {
                if ((cartItem.quantity + 1) > product.stock) {
                    // to fix
                    return res.status(400).json({ message: "Insufficient stock." });
                } else {
                    cartItem.quantity++;
                }
            } else {
                if (cartItem.quantity !== 1) {
                    cartItem.quantity--;
                }
            }

            let insufficientStock = false;
            if (product.stock < cartItem.quantity) {
                insufficientStock = true
            }

            await currentUser.populate('cart.product');
            const grandTotal = currentUser.cart.reduce((total, element) => {
                return total + (element.quantity * element.product.actualPrice);
            }, 0);
            await currentUser.save();
            return res.status(200).json({
                message: "Success",
                quantity: cartItem.quantity,
                totalPrice: product.actualPrice * cartItem.quantity,
                grandTotal,
                insufficientStock,
            });
        } else {
            return res.status(404).json({ message: "Product not found in the user's cart." });
        }
    } catch (error) {
        next(error)
    }
};

export const getCheckout = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req, res);
        if (currentUser.verified) {
            const defaultAddress = await Address.findOne({ user: req.session.user, default: true });
            await currentUser.populate('cart.product');
            await currentUser.populate('cart.product.category');
            const cartProducts = currentUser.cart;
            const grandTotal = cartProducts.reduce((total, element) => {
                return total + (element.quantity * element.product.actualPrice);
            }, 0);

            let insufficientStockProduct;
            cartProducts.forEach((cartProduct) => {
                if (cartProduct.product.stock < cartProduct.quantity) {
                    insufficientStockProduct = cartProduct._id;
                }
            });

            if (!insufficientStockProduct) {
                res.render("customer/checkout", {
                    isLoggedIn: isLoggedIn(req, res),
                    currentUser,
                    cartProducts,
                    currentAddress: defaultAddress,
                    discount: 0,
                    grandTotal,
                    currentCoupon: '',
                    couponError: '',
                    error: '',
                    activePage: 'Orders',
                });
            } else {
                res.render("customer/cart", {
                    isLoggedIn: isLoggedIn(req, res),
                    currentUser,
                    cartProducts,
                    grandTotal,
                    insufficientStockProduct,
                    activePage: 'Cart',
                });
            }
        } else {
            req.body.email = currentUser.email;
            sendToMail(req, res, currentUser._id, false);
        }
    } catch (error) {
        next(error);
    }
};