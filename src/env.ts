/**
 * Environment configuration module.
 *
 * This module must be imported first in the application entry point
 * to ensure environment variables are loaded before any other modules.
 *
 * dotenv v17+ defaults to logging injection info. We suppress this
 * with quiet: true to keep CLI output clean.
 */
import dotenv from "dotenv";

dotenv.config({ quiet: true });
