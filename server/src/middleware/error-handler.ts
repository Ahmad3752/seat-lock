import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export const notFoundHandler: RequestHandler = (req, _res, next) => next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} was not found.`));

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Something went wrong.";
  let details: unknown;
  if (error instanceof AppError) {
    statusCode = error.statusCode; code = error.code; message = error.message; details = error.details;
  } else if (error instanceof mongoose.Error.ValidationError) {
    statusCode = 422; code = "VALIDATION_ERROR"; message = "One or more fields are invalid.";
    details = Object.values(error.errors).map((item) => item.message);
  } else if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    statusCode = 409; code = "DUPLICATE_RESOURCE"; message = "A record with that value already exists.";
  }
  if (!env.isProduction && statusCode === 500) console.error(error);
  res.status(statusCode).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
};
