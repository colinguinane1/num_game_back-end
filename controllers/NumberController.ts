import { Request, Response } from "express";
import cron from "node-cron";
import User from "../models/UserModel";
const NumberModel = require(`../models/NumberModel`);

const difficulties = [
  {
    name: "easy",
    max: 10,
    maxExperience: 100,
    attempts: 4,
    color: "green",
  },
  {
    name: "medium",
    max: 200,
    maxExperience: 150,
    attempts: 8,
    color: "yellow",
  },
  {
    name: "hard",
    max: 1500,
    maxExperience: 175,
    attempts: 12,
    color: "orange",
  },
  {
    name: "very hard",
    max: 10000,
    maxExperience: 250,
    attempts: 20,
    color: "red",
  },
  {
    name: "impossible",
    max: 1000000,
    maxExperience: 550,
    attempts: 30,
    color: "white",
  },
];

const randomNumber = (max: number) => {
  return Math.floor(Math.random() * max) + 1;
};

const getUserCurrentNumberData = async (req: Request, res: Response) => {
  const { userId } = req.body;
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  const currentNumberData = user.current_number_data;
  res.status(200).json(currentNumberData);
}

const addNumberGuess = async (req: Request, res: Response) => {
  const { numberId, userId, mode } = req.body;
  const number = await NumberModel.findById(numberId);
  if (!number) return res.status(404).json({ message: "Number not found" });
  number.global_user_guesses++;
  if (userId) {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const currentData = user.current_number_data as Map<string, { attempts: number, win: boolean }>;

    // Initialize the mode if not present
    if (!currentData.has(mode)) {
      currentData.set(mode, { attempts: 0, win: false });
    }
    
    // Update the mode data
    const modeData = currentData.get(mode);
    if (modeData) {
      modeData.attempts++;
      currentData.set(mode, modeData); // Update the Map
    }
    await user.save();


  }
  await number.save();
  res.status(200).json({ number  });
};

const addCorrectGuess = async (req: Request, res: Response) => {
  const { numberId, user, xp, mode } = req.body;
  if (!numberId || !user || !xp || !user._id || !mode) {
    return res.status(400).json({ message: "Missing numberId, user, or XP or mode." });
  }
  const number = await NumberModel.findById(numberId);
  if (!number) {
    return res.status(404).json({ message: "Number not found" });
  }
  number.correct_user_guesses++;
  if (number.correct_users.includes(user._id)) {
    return res.status(400).json({ message: "User already guessed" });
  }
  const userProfile = await User.findById(user._id);
  if (userProfile) {
    userProfile.xp += xp;
    userProfile.guessed_numbers.push(number.toObject());
    const currentData = userProfile.current_number_data as Map<string, { attempts: number, win: boolean }>;

    const modeData = currentData.get(mode);
    if (modeData) {
      modeData.win = true;
      currentData.set(mode, modeData);
    }
    console.log("modeData", modeData);
    await userProfile.save();
    console.log(userProfile.username, "added", xp, "XP");
  }
  number.correct_users.push(user._id);
  await number.save();
  res.status(200).json({ number, xp });
};

const createNumber = async (req: Request, res: Response) => {
  try {
    const numberDocuments = difficulties.map((difficulty) => ({
      difficulty: difficulty.name,
      max: difficulty.max,
      value: randomNumber(difficulty.max),
      color: difficulty.color,
      maxExperience: difficulty.maxExperience,
      attempts: difficulty.attempts,
      expires: Date.now() + 24 * 60 * 60 * 1000, // Adds 24 hours to the current date
      global_user_guesses: 0,
    }));

    // Use insertMany to reduce the number of individual operations
    const createdNumbers = await NumberModel.insertMany(numberDocuments);

    // Remove all users' current_number_data
    await User.updateMany({}, { $unset: { current_number_data: "" } });

    res.status(200).json(createdNumbers);
    return;
  } catch (error) {
    console.error("Error creating numbers:", error); // For debugging
    res.status(500).json({
      message: "Error creating number",
      error: (error as Error).message,
    });
  }
};

cron.schedule("0 0 * * *", async () => {
  const production = process.env.NODE_ENV === "production";
  if (!production) {
    console.log("Not running scheduled task in development mode.");
    return;
  }
  console.log("Running scheduled task to create numbers...");
  try {
    const req = {} as Request;
    const res = {
      status: (statusCode: number) => ({
        json: (message: any) => console.log(message),
      }),
    } as Response;

    await createNumber(req, res);
  } catch (error) {
    console.error("Error running scheduled task: ", error);
  }
});

const getAllNumbers = async (req: Request, res: Response) => {
  try {
    const numbers = await NumberModel.find({});
    res.status(200).json(numbers);
  } catch (error) {
    res.status(400).json({ ok: "no", error: (error as Error).message });
  }
};

const getCurrentNumbers = async (req: Request, res: Response) => {
  try {
    const numbers = await NumberModel.find({}).sort({ expires: -1 }).limit(5);
    res.status(200).json(numbers);
  } catch (error) {
    res.status(400).json({ ok: "no", error: (error as Error).message });
  }
};

export {
  createNumber,
  addNumberGuess,
  addCorrectGuess,
  getAllNumbers,
  getCurrentNumbers,
  getUserCurrentNumberData,
};
