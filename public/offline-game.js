(() => {
  const food = ["\u{1F355}", "\u{1F32E}", "\u{1F354}", "\u{1F363}", "\u{1F951}", "\u{1F369}"];
  const board = document.getElementById("board"),
    start = document.getElementById("start"),
    status = document.getElementById("status");
  let score = 0,
    remaining = 30,
    active = -1,
    burnt = false,
    timer,
    moveTimer,
    deadline = 0;
  const buttons = Array.from({ length: 9 }, (_, index) => {
    const b = document.createElement("button");
    b.type = "button";
    b.disabled = true;
    b.textContent = "\u00b7";
    b.setAttribute("aria-label", "Empty plate");
    b.onclick = () => {
      if (index !== active || remaining <= 0) return;
      score = Math.max(0, score + (burnt ? -2 : 1));
      document.getElementById("score").textContent = "Score: " + score;
      move();
    };
    board.append(b);
    return b;
  });
  function move() {
    buttons.forEach((b) => {
      b.textContent = "\u00b7";
      b.setAttribute("aria-label", "Empty plate");
    });
    active = Math.floor(Math.random() * 9);
    burnt = Math.random() < 0.25;
    buttons[active].textContent = burnt ? "\u{1F373}" : food[Math.floor(Math.random() * food.length)];
    buttons[active].setAttribute("aria-label", burnt ? "Burnt pan: avoid" : "Catch food");
  }
  function stop() {
    clearInterval(timer);
    clearInterval(moveTimer);
    active = -1;
    buttons.forEach((b) => (b.disabled = true));
    start.disabled = false;
    start.textContent = "Play again";
    status.textContent = "Time! You caught " + score + " snacks. Hungry for another round?";
  }
  start.onclick = () => {
    clearInterval(timer);
    clearInterval(moveTimer);
    score = 0;
    remaining = 30;
    deadline = Date.now() + 30000;
    document.getElementById("score").textContent = "Score: 0";
    document.getElementById("time").textContent = "Time: 30s";
    start.disabled = true;
    buttons.forEach((b) => (b.disabled = false));
    status.textContent = "Catch those snacks!";
    move();
    moveTimer = setInterval(move, 850);
    timer = setInterval(() => {
      remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      document.getElementById("time").textContent = "Time: " + remaining + "s";
      if (!remaining) stop();
    }, 200);
  };
})();
