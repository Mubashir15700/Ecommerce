import bcrypt from "bcryptjs";
import nodeMailer from "nodemailer";
import { config } from "../config/envConfig.js";
import Otp from "../models/otpModel.js";
import catchAsync from "./catchAsyncUtil.js";

let salt;

async function generateSalt() {
    salt = await bcrypt.genSalt(10);
}

generateSalt();

export const sendToMail = (req, res, userId, isForgotPassword, next) => {
    const transporter = nodeMailer.createTransport({
        service: "Gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: config.appEmail,
            pass: config.appPassword
        },
    });

    function generateOTP(length) {
        const charset = "0123456789";
        let otp = "";

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            otp += charset[randomIndex];
        }

        return otp;
    }

    let OTP = generateOTP(4);

    const mailOptions = {
        from: {
            name: "StylesCraze",
            address: config.appEmail,
        },
        to: req.body.email,
        subject: "OTP Verification",
        html: `<p>Your otp for verification is ${OTP}</p>`,
    };

    const sendMail = catchAsync(async (transporter, options) => {
        await Otp.deleteMany({ userId });
        const hashedOTP = await bcrypt.hash(OTP, salt);
        const newotpModel = new Otp({
            userId,
            otp: hashedOTP,
        });
        await newotpModel.save();
        await transporter.sendMail(options);
        res.render("customer/auth/verification", {
            userId,
            email: req.body.email,
            commonError: "",
            isForgotPassword,
        });
    });

    sendMail(transporter, mailOptions);
};
