/** @format */

import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import { json } from "body-parser";
import { EnergyData, analyzeTrend } from "./energyAnalysis";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(json());
app.use(cors());

const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 3001;

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "energy_market",
};

// Create MySQL connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("Successfully connected to the database");
    connection.release();
    return true;
  } catch (error) {
    console.error("Failed to connect to the database:", error);
    return false;
  }
}

// Initialize database
async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        CREATE TABLE IF NOT EXISTS energy_data (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE NOT NULL,
          consumption FLOAT NOT NULL
        )
      `);
      console.log("Database initialized successfully");
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error initializing database:", error);
    process.exit(1);
  }
}

// Start server only if database connection is successful
async function startServer() {
  const isConnected = await testConnection();
  if (isConnected) {
    await initializeDatabase();

    // Try to start the server on the specified port
    const server = app
      .listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      })
      .on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.log(
            `Port ${PORT} is already in use. Trying port ${PORT + 1}`
          );
          server.close();
          app.listen(PORT + 1, () => {
            console.log(`Server running on port ${PORT + 1}`);
          });
        } else {
          console.error("Error starting server:", err);
          process.exit(1);
        }
      });
  } else {
    console.error("Server startup aborted due to database connection failure");
    console.log(
      "Please ensure MySQL is running and the connection details are correct."
    );
    console.log("You can start MySQL using: brew services start mysql");
    process.exit(1);
  }
}

startServer();

// Helper function to get and analyze data
async function getAndAnalyzeData() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT * FROM energy_data ORDER BY date"
    );

    const energyData: EnergyData[] = rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString().split("T")[0],
      consumption: row.consumption,
    }));

    const trend: string = analyzeTrend(energyData);

    return {
      trend,
      dataPoints: energyData.length,
      latestData: energyData.slice(-5),
    };
  } finally {
    connection.release();
  }
}

app.get("/api/data", async (req, res) => {
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT * FROM energy_data ORDER BY date"
    );

    const energyData: EnergyData[] = rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString().split("T")[0],
      consumption: row.consumption,
    }));

    res.json(energyData);
  } catch (error) {
    console.error("Error retrieving data:", error);
    res
      .status(500)
      .json({ error: "An error occurred while retrieving the data" });
  }
});

app.get("/api/analyze", async (req, res) => {
  try {
    const result = await getAndAnalyzeData();
    res.json(result);
  } catch (error) {
    console.error("Error processing data:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing the data" });
  }
});

app.post("/api/analyze", async (req, res) => {
  const dataInput: { date: string; consumption: number }[] = req.body.data;

  try {
    const connection = await pool.getConnection();
    try {
      if (dataInput && dataInput.length > 0) {
        await connection.beginTransaction();

        for (const item of dataInput) {
          await connection.query(
            "INSERT INTO energy_data (date, consumption) VALUES (?, ?)",
            [item.date, item.consumption]
          );
        }

        await connection.commit();
        console.log(`Inserted ${dataInput.length} new data points`);
      }
    } finally {
      connection.release();
    }

    const result = await getAndAnalyzeData();
    res.json(result);
  } catch (error) {
    console.error("Error processing data:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing the data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
