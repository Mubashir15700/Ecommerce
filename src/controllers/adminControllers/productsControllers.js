import fs from "fs";
import path from "path";
import Category from "../../models/categoryModel.js";
import Product from "../../models/productModel.js";
import { newProductErrorPage, editProductErrorPage } from "../../middlewares/errorMiddlewares.js";
import { __filename, __dirname } from "../../utils/filePathUtil.js";
import catchAsync from "../../utils/catchAsyncUtil.js";

export const getProducts = catchAsync(async (req, res, next) => {
    // pagination
    const page = parseInt(req.params.page) || 1;
    const pageSize = 3;
    const skip = (page - 1) * pageSize;
    const totalProducts = await Product.countDocuments();
    const totalPages = Math.ceil(totalProducts / pageSize);

    let foundProducts;
    if (req.query.search) {
        foundProducts = await Product.find({
            name: { $regex: req.body.searchQuery, $options: "i" }
        }).populate("category");

        return res.status(200).json({
            productDatas: foundProducts,
        });
    } else {
        foundProducts = await Product.find({}).populate("category").skip(skip).limit(pageSize);
    }
    res.render("admin/products/products", {
        productDatas: foundProducts,
        activePage: "Products",
        filtered: req.query.search ? true : false,
        currentPage: page || 1,
        totalPages: totalPages || 1,
    });
});

export const getAddNewProduct = catchAsync(async (req, res, next) => {
    const foundCategories = await Category.find({}, { name: 1 });
    res.render("admin/products/newProduct", {
        categoryOptions: foundCategories,
        error: "",
        activePage: "Products"
    });
});

export const addNewProduct = async (req, res, next) => {
    const { name, category, description, price, offerPercentage, offerValidUpto, stock, size, color, images } = req.body;
    const foundCategories = await Category.find({}, { name: 1 });
    try {
        if (!name || !description || !category || !price || !stock || !size || !color || !images) {
            res.render("admin/products/newProduct", {
                categoryOptions: foundCategories,
                error: "All fields are required.",
                activePage: "Products"
            });
        } else {
            const imagesWithPath = images.map(img => "/products/" + img);

            const savedProduct = await Product.create({
                name,
                description,
                stock,
                actualPrice: price,
                offerPercentage,
                offerValidUpto: offerValidUpto || offerPercentage && new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                category,
                size,
                color,
                images: imagesWithPath,
            });

            await Category.findByIdAndUpdate(req.body.category, { $inc: { productsCount: 1 } });
            await updateProductOfferPrice(savedProduct._id, offerPercentage);
        }
        res.redirect("/admin/products/1");
    } catch (error) {
        if (error.code === 11000) {
            newProductErrorPage(req, res, "Product with the name already exist.", foundCategories);
        } else if (error.message.includes("Product validation failed: name: Path `name`")) {
            newProductErrorPage(req, res, "Product name length should be between 2 and 20 characters.", foundCategories);
        } else if (error.message.includes("Product validation failed: name: Product name must not contain special characters")) {
            newProductErrorPage(req, res, "Product name must not contain special characters.", foundCategories);
        } else if (error.message.includes("is longer than the maximum allowed length (200).")) {
            newProductErrorPage(req, res, "Product description length should be between 4 and 200 characters.", foundCategories);
        } else if (
            error.message.includes("Product validation failed: price: Path `price`") ||
            error.message.includes("Product validation failed: stock: Path `stock`")) {
            newProductErrorPage(req, res, "Price and Stock values should not be negative.", foundCategories);
        } else {
            next(error);
        }
    }
};

export const getProduct = catchAsync(async (req, res, next) => {
    const foundProduct = await Product.findById(req.params.id);
    console.log(foundProduct);
    const foundCategories = await Category.find({}, { name: 1 });
    res.render("admin/products/editProduct", {
        productData: foundProduct,
        categoryOptions: foundCategories,
        error: "",
        activePage: "Products"
    });
});

export const editProduct = async (req, res, next) => {
    const foundProduct = await Product.findById(req.params.id);
    const foundCategories = await Category.find({}, { name: 1 });
    try {
        await Product.findByIdAndUpdate(req.params.id, {
            $set: {
                name: req.body.name,
                category: req.body.category,
                description: req.body.description,
                actualPrice: req.body.price,
                offerPercentage: req.body.offerPercentage,
                offerValidUpto: req.body.offerValidUpto || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                stock: req.body.stock,
                size: req.body.size,
                color: req.body.color
            }
        }, { runValidators: true });

        const currentCategory = await Category.findById(foundProduct.category);
        const newCategoryId = await Product.findById(req.params.id);
        const newCategory = await Category.findById(newCategoryId.category);
        if (currentCategory._id.toString() !== newCategory._id.toString()) {
            currentCategory.productsCount -= 1;
            newCategory.productsCount += 1;
        }

        await currentCategory.save();
        await newCategory.save();

        await updateProductOfferPrice(req.params.id, req.body.offerPercentage);

        res.redirect("/admin/products/1");
    } catch (error) {
        if (error.code === 11000) {
            editProductErrorPage(req, res, "Product with the name already exist.", foundProduct, foundCategories);
        } else if (error.message.includes("Validation failed: name: Path `name`")) {
            editProductErrorPage(req, res, "Product name length should be between 4 and 20 characters.", foundProduct, foundCategories);
        } else if (error.message.includes("Validation failed: name: Product name must not contain special characters")) {
            editProductErrorPage(req, res, "Product name must not contain special characters.", foundProduct, foundCategories);
        } else if (error.message.includes("is longer than the maximum allowed length (200).")) {
            editProductErrorPage(req, res, "Product description length should be between 4 and 200 characters.", foundProduct, foundCategories);
        } else if (
            error.message.includes("Validation failed: price: Path `price`") ||
            error.message.includes("Validation failed: stock: Path `stock`")) {
            editProductErrorPage(req, res, "Price and Stock values should not be negative.", foundProduct, foundCategories);
        } else {
            next(error);
        }
    }
};

async function updateProductOfferPrice(productId, offerPercentage) {
    // Calculate the amount to subtract based on the percentage
    const amountToSubtract = offerPercentage > 0 ? Number(offerPercentage) / 100 : 0;

    await Product.findByIdAndUpdate(productId,
        [
            {
                $set: {
                    tempProductOfferPrice: {
                        $cond: {
                            if: { $eq: [amountToSubtract, 0] },
                            then: null,
                            else: { $subtract: ["$actualPrice", { $multiply: ["$actualPrice", amountToSubtract] }] },
                        },
                    },
                },
            },
            {
                $set: {
                    productOfferPrice: "$tempProductOfferPrice",
                },
            },
            {
                $unset: "tempProductOfferPrice",
            },
        ]
    );
};

export const deleteImage = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { image } = req.body;

    await Product.findByIdAndUpdate(id, { $pull: { images: image } }, { new: true });

    // Construct the full path to the image file
    const imagePath = path.join(__dirname, "../../public/uploads", image);

    // Check if the image file exists
    if (fs.existsSync(imagePath)) {
        fs.unlink(imagePath, (err) => {
            if (err) {
                throw err;
            }
        });
    }

    res.redirect(`/admin/products/${id}/edit`);
});

export const addImage = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { images } = req.body;
    let imagesWithPath;
    if (images && images.length) {
        imagesWithPath = images.map(image => "/products/" + image);
    }

    await Product.findByIdAndUpdate(id, { $push: { images: imagesWithPath } }, { new: true });
    res.redirect(`/admin/products/${id}/edit`);
});

export const productAction = catchAsync(async (req, res, next) => {
    const state = req.body.state === "1";
    await Product.findByIdAndUpdate(req.params.id, { $set: { softDeleted: state } });
    if (state === true) {
        await Category.findOneAndUpdate({ name: req.body.category }, { $inc: { productsCount: -1 } });
    } else {
        await Category.findOneAndUpdate({ name: req.body.category }, { $inc: { productsCount: 1 } });
    }
    res.redirect("/admin/products/1");
});
