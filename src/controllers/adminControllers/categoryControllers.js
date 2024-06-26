import fs from "fs";
import path from "path";
import Category from "../../models/categoryModel.js";
import Product from "../../models/productModel.js";
import { __filename, __dirname } from "../../utils/filePathUtil.js";
import catchAsync from "../../utils/catchAsyncUtil.js";

export const getCategories = catchAsync(async (req, res, next) => {
    // pagination
    const page = parseInt(req.params.page) || 1;
    const pageSize = 3;
    const skip = (page - 1) * pageSize;
    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / pageSize);

    let foundCategories;
    if (req.query.search) {
        foundCategories = await Category.find({
            $or: [
                { name: { $regex: req.body.searchQuery, $options: "i" } }
            ]
        });

        return res.status(200).json({
            categoryDatas: foundCategories,
        });
    } else {
        foundCategories = await Category.find().skip(skip).limit(pageSize);
    }

    res.render("admin/categories/categories", {
        categoryDatas: foundCategories,
        activePage: "Categories",
        filtered: req.query.search ? true : false,
        currentPage: page || 1,
        totalPages: totalPages || 1,
    });
});

export const newCategory = (req, res) => {
    res.render("admin/categories/newCategory", {
        error: "",
        activePage: "Categories"
    });
};

export const addNewCategory = async (req, res, next) => {
    try {
        const { name, photo, offerPercentage, offerValidUpto } = req.body;
        if (!name || !photo) {
            res.render("admin/categories/newCategory", {
                error: "Category name and photo are required.",
                activePage: "Categories"
            });
        }

        const category = await Category.create({
            name,
            image: "/categories/" + photo,
            offerPercentage,
            offerValidUpto: offerValidUpto || offerPercentage && new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        const categoryId = category._id;
        await updateCategoryOfferPrice(categoryId, offerPercentage);

        res.redirect("/admin/categories/1");
    } catch (error) {
        let foundError = false;
        let errorMessage;
        if (error.code === 11000) {
            foundError = true;
            errorMessage = "Category with the name already exist.";
        } else if (error.message.includes("Category validation failed: name: Path `name`")) {
            foundError = true;
            errorMessage = "Category name length should be between 4 and 20 characters.";
        } else if (error.message.includes("Category validation failed: name: Category name must not contain special characters")) {
            foundError = true;
            errorMessage = error.message
        }
        if (foundError) {
            res.render("admin/categories/newCategory", {
                error: errorMessage,
                activePage: "Categories"
            });
        } else {
            next(error);
        }
    }
};

export const getCategory = catchAsync(async (req, res, next) => {
    const foundCategory = await Category.findById(req.params.id);
    if (!foundCategory) {
        console.log("no category found");
    } else {
        res.render("admin/categories/editCategory", {
            categoryData: foundCategory,
            error: "",
            activePage: "Categories"
        });
    }
});

export const editCategory = async (req, res, next) => {
    const { id } = req.params;
    const { name, photo, offerPercentage, offerValidUpto } = req.body;

    try {
        const foundCategory = await Category.findById(req.params.id);
        const category = await Category.findById(id);

        let updatedObj = {
            name,
            offerPercentage,
            offerValidUpto: offerValidUpto || offerPercentage && new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        };

        if (typeof photo !== "undefined") {
            // Construct the full path to the image file
            const imagePath = path.join(__dirname, "../../public/uploads", category.image);

            // Check if the image file exists
            if (fs.existsSync(imagePath)) {
                fs.unlink(imagePath, (err) => {
                    if (err) {
                        throw err;
                    }
                });
            }

            updatedObj.image = "/categories/" + photo;
        }

        await category.updateOne(updatedObj, { runValidators: true });

        await updateCategoryOfferPrice(id, offerPercentage);

        res.redirect("/admin/categories/1");
    } catch (error) {
        let foundError = false;
        let errorMessage;
        if (error.code === 11000) {
            foundError = true;
            errorMessage = "Category with the name already exist.";
        } else if (error.message.includes("is longer than the maximum allowed length (20)")) {
            foundError = true;
            errorMessage = "Category name length should be between 4 and 20 characters.";
        } else if (error.message.includes("Category name must not contain special characters")) {
            foundError = true;
            errorMessage = error.message;
        }
        if (foundError) {
            res.render("admin/categories/editCategory", {
                categoryData: foundCategory,
                error: errorMessage,
                activePage: "Categories"
            });
        } else {
            next(error);
        }
    }
};

async function updateCategoryOfferPrice(categoryId, offerPercentage) {
    // Calculate the amount to subtract based on the percentage
    const amountToSubtract = offerPercentage > 0 ? Number(offerPercentage) / 100 : 0;

    await Product.updateMany(
        { category: categoryId },
        [
            {
                $set: {
                    tempCategoryOfferPrice: {
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
                    categoryOfferPrice: "$tempCategoryOfferPrice",
                },
            },
            {
                $unset: "tempCategoryOfferPrice",
            },
        ]
    );
};

export const categoryAction = catchAsync(async (req, res, next) => {
    const state = req.body.state === "1";
    await Category.findByIdAndUpdate(req.params.id, { $set: { removed: state } });
    res.redirect("/admin/categories/1");
});
