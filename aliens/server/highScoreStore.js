const fs = require("fs");
const path = require("path");

const HIGH_SCORE_PATH = path.join(__dirname, "highscores.json");
const MAX_HIGH_SCORES = 10;

function readHighScores() {
  try {
    const raw = fs.readFileSync(HIGH_SCORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function writeHighScores(scores) {
  fs.writeFileSync(HIGH_SCORE_PATH, `${JSON.stringify(scores, null, 2)}\n`);
}

class HighScoreStore {
  constructor() {
    this.scores = readHighScores();
  }

  list() {
    return this.scores;
  }

  add(entry) {
    this.scores = [...this.scores, entry]
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return right.wave - left.wave;
      })
      .slice(0, MAX_HIGH_SCORES);

    writeHighScores(this.scores);
    return this.scores;
  }
}

module.exports = { HighScoreStore };
