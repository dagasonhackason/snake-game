// Get the canvas element and its drawing context
const canvas = document.getElementById('game');
canvas.width = 600;
canvas.height = 600;
const ctx = canvas.getContext('2d');

// Set the size of each grid cell
const grid = 20;

// Used to control the game speed
let count = 0;
let speed = 16; // Initial speed (higher is slower)

// Snake is represented as an array of segments (objects with x and y coordinates)
let snake = [{ x: 160, y: 160 }];

// Snake's movement direction (dx, dy) -- USE window.dx/window.dy everywhere!
window.dx = grid;
window.dy = 0;

// Food position (yellow, increases score)
let food = { x: 320, y: 320 };

// Deadly obstacles (gray, kill on collision)
let deadlyObstacles = [
  { x: 60, y: 60 },
  { x: 200, y: 200 },
  { x: 340, y: 100 }
];

// Player's score, level, lives, and name
let score = 0;
let level = 1;
let lives = 4;
let playerName = "";

// Level and difficulty settings
const maxLevel = 10;
const levelThresholds = [0, 3, 7, 12, 18, 25, 33, 42, 52, 63, 75];

// High scores array (stored in localStorage)
let highscores = JSON.parse(localStorage.getItem('snakeHighscores') || '[]');

// Badges array (stored in localStorage, keyed by playerName)
let badges = JSON.parse(localStorage.getItem('snakeBadges') || '{}');

// Bonus food types and their properties
const bonusFoods = [
  { color: 'blue',    points: 5,   duration: 2000 }, // ms
  { color: 'violet',  points: 10,  duration: 1800 },
  { color: 'orange',  points: 15,  duration: 1500 },
  { color: 'white',   points: 25,  duration: 1200 }
];

// State for bonus food
let activeBonusFood = null; // {x, y, color, points, expiresAt}
let bonusFoodTimer = null;
let bonusFoodSpeedUp = false;
let bonusFoodLastLevel = 1;

// Bonus food spawn interval (ms)
const BONUS_FOOD_MIN_INTERVAL = 180000; // 3 minutes
let lastBonusFoodTime = Date.now();

// Pause state
let isPaused = false;
let pauseDialog = null;

// Wall danger state per level (0 = safe, 1 = top, 2 = top+bottom, 3 = top+bottom+left, 4 = all)
function getWallDanger(level) {
  if (level < 3) return 0;
  if (level < 5) return 1;
  if (level < 7) return 2;
  if (level < 9) return 3;
  return 4;
}

// Generate a random position for food or obstacle, aligned to the grid
function getRandomPosition() {
  return Math.floor(Math.random() * (canvas.width / grid)) * grid;
}

// Generate a random position that does not overlap with snake, obstacles, or food
function getSafeRandomPosition() {
  let pos;
  let collision;
  do {
    pos = { x: getRandomPosition(), y: getRandomPosition() };
    collision =
      snake.some(segment => segment.x === pos.x && segment.y === pos.y) ||
      deadlyObstacles.some(ob => ob.x === pos.x && ob.y === pos.y) ||
      (food && food.x === pos.x && food.y === pos.y);
  } while (collision);
  return pos;
}

// Utility: get a random bonus food type (rarer at higher levels)
function getRandomBonusFoodType(level) {
  // Higher levels: rarer bonus foods
  let weights = [0.6, 0.25, 0.10, 0.05]; // blue, violet, orange, white
  if (level > 5) weights = [0.7, 0.18, 0.08, 0.04];
  if (level > 8) weights = [0.8, 0.13, 0.05, 0.02];
  const r = Math.random();
  let sum = 0;
  for (let i = 0; i < bonusFoods.length; i++) {
    sum += weights[i];
    if (r < sum) return bonusFoods[i];
  }
  return bonusFoods[0];
}

// Utility: get a random position near an obstacle, but not on one
function getBonusFoodPosition() {
  // Pick a random obstacle, then a random adjacent cell
  if (deadlyObstacles.length === 0) return getSafeRandomPosition();
  const ob = deadlyObstacles[Math.floor(Math.random() * deadlyObstacles.length)];
  const dirs = [
    {dx: grid, dy: 0}, {dx: -grid, dy: 0}, {dx: 0, dy: grid}, {dx: 0, dy: -grid}
  ];
  for (let tries = 0; tries < 10; tries++) {
    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const pos = { x: ob.x + dir.dx, y: ob.y + dir.dy };
    // Must be in bounds and not on snake, food, or obstacle
    if (
      pos.x >= 0 && pos.x < canvas.width &&
      pos.y >= 0 && pos.y < canvas.height &&
      !snake.some(s => s.x === pos.x && s.y === pos.y) &&
      !deadlyObstacles.some(o => o.x === pos.x && o.y === pos.y) &&
      !(food.x === pos.x && food.y === pos.y)
    ) {
      return pos;
    }
  }
  // fallback
  return getSafeRandomPosition();
}

// Try to spawn a bonus food (with probability decreasing at higher levels)
function maybeSpawnBonusFood() {
  if (activeBonusFood) return;
  // Only allow bonus food after interval has passed
  if (Date.now() - lastBonusFoodTime < BONUS_FOOD_MIN_INTERVAL) return;
  let chance = 0.18 - (level * 0.012); // gets rarer
  if (Math.random() < Math.max(0.03, chance)) {
    const type = getRandomBonusFoodType(level);
    const pos = getBonusFoodPosition();
    // Make bonus food last 4x longer
    const visibleDuration = (type.duration || 1500) * 4;
    activeBonusFood = {
      ...pos,
      color: type.color,
      points: type.points,
      expiresAt: Date.now() + visibleDuration
    };
    // Speed up game while bonus food is active
    bonusFoodSpeedUp = true;
    bonusFoodLastLevel = level;
    // Store the speed before bonus
    activeBonusFood._prevSpeed = speed;
    speed = Math.max(2, speed - 7); // much faster
    // Start timer to remove bonus food
    if (bonusFoodTimer) clearTimeout(bonusFoodTimer);
    bonusFoodTimer = setTimeout(() => {
      activeBonusFood = null;
      bonusFoodSpeedUp = false;
      // Restore speed to what it should be for the current level
      speed = Math.max(3, 16 - (level - 1) * 1.5);
      updateScorebar();
      // Hide timer bar
      const timerBar = document.getElementById('bonus-timer-bar');
      if (timerBar) {
        timerBar.style.visibility = 'hidden';
        timerBar.textContent = '';
      }
      lastBonusFoodTime = Date.now(); // reset interval after bonus food disappears
    }, visibleDuration);
  }
}

// Reset the game to its initial state (but keep playerName)
function resetGame(keepLevel = false) {
  snake = [{ x: 160, y: 160 }];
  window.dx = grid;
  window.dy = 0;
  food = getSafeRandomPosition();
  deadlyObstacles = [
    getSafeRandomPosition(),
    getSafeRandomPosition(),
    getSafeRandomPosition()
  ];
  score = 0;
  if (!keepLevel) {
    level = 1;
    speed = 16;
    lives = 4;
  }
  activeBonusFood = null;
  bonusFoodSpeedUp = false;
  if (bonusFoodTimer) clearTimeout(bonusFoodTimer);
  const timerBar = document.getElementById('bonus-timer-bar');
  if (timerBar) {
    timerBar.style.visibility = 'hidden';
    timerBar.textContent = '';
  }
}

// Update level, speed, and obstacles based on score
function updateLevel() {
  for (let i = maxLevel; i >= 1; i--) {
    if (score >= levelThresholds[i]) {
      if (level !== i) {
        level = i;
        // Increase obstacles at each new level (up to maxLevel)
        while (deadlyObstacles.length < 2 + level) {
          deadlyObstacles.push(getSafeRandomPosition());
        }
        // Increase speed (lower value = faster)
        if (!bonusFoodSpeedUp) {
          speed = Math.max(3, 16 - (level - 1) * 1.5);
        }
      }
      break;
    }
  }
}

// Draw dangerous red wall segments based on level
function drawDangerWalls() {
  const danger = getWallDanger(level);
  ctx.save();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "red";
  if (danger >= 1) {
    // Top wall
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(canvas.width, 0);
    ctx.stroke();
  }
  if (danger >= 2) {
    // Bottom wall
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 1);
    ctx.lineTo(canvas.width, canvas.height - 1);
    ctx.stroke();
  }
  if (danger >= 3) {
    // Left wall
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, canvas.height);
    ctx.stroke();
  }
  if (danger >= 4) {
    // Right wall
    ctx.beginPath();
    ctx.moveTo(canvas.width - 1, 0);
    ctx.lineTo(canvas.width - 1, canvas.height);
    ctx.stroke();
  }
  ctx.restore();
}

// Handle wall collision and wrap or lose life
function handleWall(head) {
  const danger = getWallDanger(level);
  let hitDanger = false;
  // Top wall
  if (head.y < 0) {
    if (danger >= 1) hitDanger = true;
    else head.y = canvas.height - grid;
  }
  // Bottom wall
  if (head.y >= canvas.height) {
    if (danger >= 2) hitDanger = true;
    else head.y = 0;
  }
  // Left wall
  if (head.x < 0) {
    if (danger >= 3) hitDanger = true;
    else head.x = canvas.width - grid;
  }
  // Right wall
  if (head.x >= canvas.width) {
    if (danger >= 4) hitDanger = true;
    else head.x = 0;
  }
  return hitDanger;
}

// Highscore logic with badges
function updateHighscores(newEntry) {
  // Check if player already has a highscore entry
  const existingIndex = highscores.findIndex(
    entry => entry.playerName === newEntry.playerName
  );
  if (existingIndex !== -1) {
    // Replace only if new score is better (higher score, or same score but higher level/lives)
    const old = highscores[existingIndex];
    if (
      newEntry.score > old.score ||
      (newEntry.score === old.score && newEntry.level > old.level) ||
      (newEntry.score === old.score && newEntry.level === old.level && newEntry.lives > old.lives)
    ) {
      highscores[existingIndex] = newEntry;
    }
    // else keep the old entry
  } else {
    highscores.push(newEntry);
  }
  // Sort: highest score, then level, then lives
  highscores.sort((a, b) => 
    b.score - a.score ||
    b.level - a.level ||
    b.lives - a.lives
  );
  // Keep only top 10
  highscores = highscores.slice(0, 10);
  localStorage.setItem('snakeHighscores', JSON.stringify(highscores));
  localStorage.setItem('snakeBadges', JSON.stringify(badges));
  // Render with nice spacing and Codename first, plus badges
  const hsList = document.getElementById('highscores');
  hsList.innerHTML = `
    <li style="display: flex; justify-content: space-between; font-weight: bold; padding: 4px 0;">
      <span style="flex:2;">Codename</span>
      <span style="flex:1; text-align:center;">Score</span>
      <span style="flex:1; text-align:center;">Level</span>
      <span style="flex:1; text-align:center;">Lives</span>
      <span style="flex:1; text-align:center;">Badges</span>
    </li>
    ${highscores.map(entry =>
      `<li style="display: flex; justify-content: space-between; padding: 4px 0;">
        <span style="flex:2;">${entry.playerName}</span>
        <span style="flex:1; text-align:center;">${entry.score}</span>
        <span style="flex:1; text-align:center;">${entry.level}</span>
        <span style="flex:1; text-align:center;">${entry.lives}</span>
        <span style="flex:1; text-align:center;">${badges[entry.playerName] || 0}</span>
      </li>`
    ).join('')}
  `;
}

function updateScorebar() {
  document.getElementById('score-label').textContent = `Score: ${score}`;
  document.getElementById('level-label').textContent = `Level: ${level}`;
  document.getElementById('lives-label').textContent = `Lives: ${lives}`;
}

// Keyboard and onscreen controls
document.addEventListener('keydown', e => {
  if (isPaused) return;
  if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && window.dx === 0) {
    window.dx = -grid; window.dy = 0;
  } else if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && window.dy === 0) {
    window.dx = 0; window.dy = -grid;
  } else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && window.dx === 0) {
    window.dx = grid; window.dy = 0;
  } else if ((e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') && window.dy === 0) {
    window.dx = 0; window.dy = grid;
  }
});

// Award badge if player completes all 10 levels
function awardBadgeIfCompleted() {
  if (level === maxLevel && score >= levelThresholds[maxLevel]) {
    badges[playerName] = (badges[playerName] || 0) + 1;
    localStorage.setItem('snakeBadges', JSON.stringify(badges));
  }
}

function showPauseDialog() {
  if (pauseDialog) return;
  isPaused = true;

  pauseDialog = document.createElement('div');
  pauseDialog.style.position = 'fixed';
  pauseDialog.style.top = '0';
  pauseDialog.style.left = '0';
  pauseDialog.style.width = '100vw';
  pauseDialog.style.height = '100vh';
  pauseDialog.style.background = 'rgba(0,0,0,0.55)';
  pauseDialog.style.display = 'flex';
  pauseDialog.style.alignItems = 'center';
  pauseDialog.style.justifyContent = 'center';
  pauseDialog.style.zIndex = '9999';

  const inner = document.createElement('div');
  inner.style.background = '#222';
  inner.style.color = '#fff';
  inner.style.padding = '32px 24px 24px 24px';
  inner.style.borderRadius = '12px';
  inner.style.boxShadow = '0 4px 32px #000';
  inner.style.textAlign = 'center';
  inner.style.maxWidth = '90vw';
  inner.style.fontSize = '18px';

  inner.innerHTML = `
    <div style="font-size:22px;margin-bottom:18px;">Game Paused</div>
    <div style="margin-bottom:18px;">
      We know playing contintuesly can be tiring 🥹😴🤤...<br>
      When you done resting, please click the '<b>CONTINUE</b>' button on this dialog to continue.
    </div>
  `;

  const btn = document.createElement('button');
  btn.textContent = 'CONTINUE';
  btn.style.fontSize = '18px';
  btn.style.padding = '10px 32px';
  btn.style.marginTop = '8px';
  btn.style.background = '#00eaff';
  btn.style.color = '#222';
  btn.style.border = 'none';
  btn.style.borderRadius = '6px';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = 'bold';
  btn.addEventListener('click', () => {
    isPaused = false;
    if (pauseDialog) {
      document.body.removeChild(pauseDialog);
      pauseDialog = null;
    }
    requestAnimationFrame(gameLoop);
  });

  inner.appendChild(btn);
  pauseDialog.appendChild(inner);
  document.body.appendChild(pauseDialog);
}

function gameLoop() {
  if (isPaused) return;

  requestAnimationFrame(gameLoop);

  // Slow down the game by only updating every 'speed' frames
  if (++count < speed) return;
  count = 0;

  // Use window.dx and window.dy for movement
  let head = { x: snake[0].x + window.dx, y: snake[0].y + window.dy };

  // Handle wall collision (wrap or lose life)
  if (handleWall(head)) {
    lives--;
    updateScorebar();
    if (lives > 0) {
      alert("Ouch! You hit a dangerous wall. Lives left: " + lives);
      snake = [{ x: 160, y: 160 }];
      window.dx = grid; window.dy = 0;
      return;
    } else {
      setTimeout(() => {
        alert("Mission Failed!... Please Try Again 😢");
        updateHighscores({ score, level, lives: 0, playerName });
        resetGame();
        updateScorebar();
      }, 100);
      return;
    }
  }

  snake.unshift(head);

  // Check if the snake has eaten the yellow food
  if (head.x === food.x && head.y === food.y) {
    score++;
    food = getSafeRandomPosition();
    updateLevel();
    updateScorebar();
    // If max level reached and score threshold met, show win dialog
    if (level === maxLevel && score >= levelThresholds[maxLevel]) {
      setTimeout(() => {
        awardBadgeIfCompleted();
        alert(`Congratulations ${playerName}... Mission Complete! 😃🎊🎉`);
        updateHighscores({ score, level, lives, playerName });
        resetGame();
        updateScorebar();
      }, 100);
      return;
    }
  } else {
    // Remove the last segment if no food eaten (snake moves forward)
    snake.pop();
  }

  // Check for collision with self or deadly obstacles
  if (
    snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y) ||
    deadlyObstacles.some(ob => ob.x === head.x && ob.y === head.y)
  ) {
    lives--;
    updateScorebar();
    if (lives > 0) {
      alert("Ouch! You hit an obstacle. Lives left: " + lives);
      snake = [{ x: 160, y: 160 }];
      window.dx = grid; window.dy = 0;
      return;
    } else {
      setTimeout(() => {
        alert("Mission Failed!... Please Try Again 😢");
        updateHighscores({ score, level, lives: 0, playerName });
        resetGame();
        updateScorebar();
      }, 100);
      return;
    }
  }

  // Try to spawn bonus food (call every frame)
  maybeSpawnBonusFood();

  // Clear the canvas for the new frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw the dangerous walls
  drawDangerWalls();

  // Draw the food as a yellow square
  ctx.fillStyle = 'yellow';
  ctx.fillRect(food.x, food.y, grid, grid);

  // Draw bonus food if active
  if (activeBonusFood) {
    ctx.fillStyle = activeBonusFood.color;
    ctx.beginPath();
    ctx.arc(
      activeBonusFood.x + grid / 2,
      activeBonusFood.y + grid / 2,
      grid / 2 - 2,
      0, 2 * Math.PI
    );
    ctx.fill();
    // Draw timer bar under the canvas
    const timerBar = document.getElementById('bonus-timer-bar');
    if (timerBar) {
      const left = Math.max(0, activeBonusFood.expiresAt - Date.now());
      const type = bonusFoods.find(b => b.color === activeBonusFood.color);
      const visibleDuration = (type.duration || 1500) * 4;
      const pct = left / visibleDuration;
      timerBar.style.width = `${Math.max(0, pct * 100)}%`;
      timerBar.style.background = activeBonusFood.color;
      timerBar.style.visibility = 'visible';
      timerBar.textContent = `${Math.ceil(left / 1000)}s`;
      timerBar.style.textAlign = "center";
      timerBar.style.color = "#222";
      timerBar.style.fontWeight = "bold";
      timerBar.style.fontSize = "12px";
      timerBar.style.lineHeight = "10px";
    }
  } else {
    // Hide timer bar if not active
    const timerBar = document.getElementById('bonus-timer-bar');
    if (timerBar) {
      timerBar.style.visibility = 'hidden';
      timerBar.textContent = '';
    }
  }

  // Draw deadly obstacles as gray squares
  ctx.fillStyle = 'gray';
  deadlyObstacles.forEach(ob => ctx.fillRect(ob.x, ob.y, grid, grid));

  // Draw the snake as green squares
  ctx.fillStyle = 'lime';
  snake.forEach(segment => ctx.fillRect(segment.x, segment.y, grid, grid));

  // When snake eats bonus food
  if (
    activeBonusFood &&
    snake[0].x === activeBonusFood.x &&
    snake[0].y === activeBonusFood.y
  ) {
    score += activeBonusFood.points;
    activeBonusFood = null;
    bonusFoodSpeedUp = false;
    if (bonusFoodTimer) clearTimeout(bonusFoodTimer);
    // Restore speed to what it should be for the current level
    speed = Math.max(3, 16 - (level - 1) * 1.5);
    updateLevel();
    updateScorebar();
    // Hide timer bar
    const timerBar = document.getElementById('bonus-timer-bar');
    if (timerBar) {
      timerBar.style.visibility = 'hidden';
      timerBar.textContent = '';
    }
    lastBonusFoodTime = Date.now(); // reset interval after bonus food is eaten
  }
}

function moveUp() {
    if (window.isPaused) return;
    if (window.dy === 0) { window.dx = 0; window.dy = -grid; }
}
function moveDown() {
    if (window.isPaused) return;
    if (window.dy === 0) { window.dx = 0; window.dy = window.grid; }
}
function moveLeft() {
    if (window.isPaused) return;
    if (window.dx === 0) { window.dx = -window.grid; window.dy = 0; }
}
function moveRight() {
    if (window.isPaused) return;
    if (window.dx === 0) { window.dx = window.grid; window.dy = 0; }
}

window.onload = function () {
  playerName = prompt("Enter your code name to begin:");
  if (!playerName) playerName = "Agent";
  document.getElementById('hints-content').innerHTML = `
    <b>Welcome, ${playerName}!</b><br>
    <ul>
      <li>Use <b>arrow keys</b> to control the snake.</li>
      <li>Eat <span style="color:gold;">yellow food</span> to grow and score points.</li>
      <li>Bonus foods: <span style="color:blue;">blue</span>, <span style="color:violet;">violet</span>, <span style="color:orange;">orange</span>, <span style="color:white;">white</span> give more points but are rare and timed!</li>
      <li>Avoid <span style="color:gray;">gray obstacles</span> and your own body.</li>
      <li>You have <b>4 lives</b>. Colliding with obstacles, yourself, or dangerous red walls costs a life.</li>
      <li>At lower levels, you can pass through walls (snake wraps around).</li>
      <li>As you level up, <span style="color:red;">red wall borders</span> appear. Hitting these costs a life!</li>
      <li>Reach Level 10 and the final score threshold to win!</li>
      <li>When all lives are lost, the mission fails.</li>
    </ul>
    <b>Good luck, Agent ${playerName}!</b>
  `;
  updateScorebar();
  updateHighscores({ score: 0, level: 1, lives: 4, playerName }); // Ensure player is in highscore list
  resetGame();
  requestAnimationFrame(gameLoop);

  // Pause button logic
  const pauseBtn = document.getElementById('btn-pause');
  const btnUp = document.getElementById('btn-up');
  const btnDown = document.getElementById('btn-down');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (!isPaused) showPauseDialog();
    });
  }

  if (btnUp) {
    btnUp.addEventListener('click', () => {
      moveUp();
    });
  }

  if (btnDown) {
    btnDown.addEventListener('click', () => {
      moveDown();
    });
  }

  if (btnLeft) {
    btnLeft.addEventListener('click', () => {
      moveLeft();
    });
  }

  if (btnRight) {
    btnRight.addEventListener('click', () => {
      moveRight();
    });
  }
};