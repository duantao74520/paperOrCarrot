(function () {
  const GAME_DURATION = 30; // seconds
  const STORAGE_KEYS = {
    muted: "rvst_sound_muted",
    bestScore: "rvst_best_score"
  };

  const PRAISE_TEXTS = [
    "真棒！继续！",
    "这爪子有点东西～",
    "太会选了，猫猫都惊呆了！",
    "这一下，主人直接夸疯了～",
    "完了，被你帅到，只能夸夸了",
    "稳！再来一拍？"
  ];

  const WRONG_TEXTS = [
    "这次没对，再试试~",
    "差一点点！猫猫表示可以原谅",
    "不要紧，下次一定拍对！",
    "主人：我就当你在卖萌了～",
    "谁还没个瞎蒙滑掉的时候呢"
  ];

  const state = {
    gameState: "start", // start | playing | ended
    score: 0,
    combo: 0,
    maxCombo: 0,
    praiseCount: 0,
    remainingTime: GAME_DURATION,
    lastFrameTs: null,
    rafId: null,
    currentCorrectType: null, // "carrot" | "tissue"
    inputLocked: false,
    muted: false,
    lastResult: {
      finalScore: 0,
      timeBonus: 0,
      remainingSeconds: 0,
      praiseCount: 0,
      maxCombo: 0
    }
  };

  // Elements
  const screenStart = document.getElementById("screen-start");
  const screenPlay = document.getElementById("screen-play");
  const screenEnd = document.getElementById("screen-end");

  const btnStart = document.getElementById("btn-start");
  const btnRestart = document.getElementById("btn-restart");
  const btnShare = document.getElementById("btn-share");

  const muteToggle = document.getElementById("mute-toggle");
  const muteIcon = document.getElementById("mute-icon");

  const timeValueEl = document.getElementById("time-value");
  const scoreValueEl = document.getElementById("score-value");
  const comboValueEl = document.getElementById("combo-value");
  const hudItems = document.querySelectorAll(".hud-item");

  const questionTextEl = document.getElementById("question-text");
  const hintTextEl = document.getElementById("hint-text");

  const cardLeft = document.getElementById("card-left");
  const cardRight = document.getElementById("card-right");

  const overlayPraise = document.getElementById("overlay-praise");
  const comboFireText = document.getElementById("combo-fire-text");

  const toastEl = document.getElementById("toast");

  const finalScoreEl = document.getElementById("final-score");
  const bestComboEl = document.getElementById("best-combo");
  const praiseCountEl = document.getElementById("praise-count");
  const timeBonusEl = document.getElementById("time-bonus");
  const remainSecEl = document.getElementById("remain-sec");
  const bestScoreOverallEl = document.getElementById("best-score-overall");

  let audioCtx = null;

  function ensureAudioCtx() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }

  function playTone(type) {
    if (state.muted) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === "ok") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.16);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(260, now + 0.14);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    }

    osc.start(now);
    osc.stop(now + 0.22);
  }

  // 播放指定目录中的随机音频文件
  function playRandomAudio(dir) {
    if (state.muted) return;
    
    // 根据目录确定可用的音频文件
    let audioFiles = [];
    
    if (dir === "paper") {
      audioFiles = ["data/audio/paper/paper_1.mp3", "data/audio/paper/paper_2.mp3"];
    } else if (dir === "carrot") {
      audioFiles = ["data/audio/carrot/carrot_1.mp3", "data/audio/carrot/carrot_2.mp3"];
    } else if (dir === "good") {
      audioFiles = ["data/audio/good/good_1.mp3", "data/audio/good/good_2.mp3"];
    } else if (dir === "wrong") {
      audioFiles = ["data/audio/wrong/wrong.mp3"];
    }
    
    if (audioFiles.length === 0) return;
    
    // 随机选择一个音频文件
    const randomFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
    
    // 创建音频元素并播放
    const audio = new Audio(randomFile);
    audio.volume = 0.7; // 设置音量
    
    // 处理播放错误
    audio.addEventListener('error', function(e) {
      console.error('音频播放错误:', e);
      // 如果音频文件播放失败，回退到音效
      if (dir === "good") {
        playTone("ok");
      } else if (dir === "wrong") {
        playTone("ng");
      }
    });
    
    // 播放音频
    audio.play().catch(error => {
      console.error('音频播放失败:', error);
      // 如果音频文件播放失败，回退到音效
      if (dir === "good") {
        playTone("ok");
      } else if (dir === "wrong") {
        playTone("ng");
      }
    });
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("show");
    setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1800);
  }

  function switchScreen(name) {
    state.gameState = name;
    [screenStart, screenPlay, screenEnd].forEach((el) => {
      if (!el) return;
      el.classList.remove("active");
    });
    if (name === "start") screenStart.classList.add("active");
    if (name === "playing") screenPlay.classList.add("active");
    if (name === "ended") screenEnd.classList.add("active");
  }

  function resetState() {
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.praiseCount = 0;
    state.remainingTime = GAME_DURATION;
    state.lastFrameTs = null;
    state.currentCorrectType = null;
    state.inputLocked = false;

    updateScoreUI();
    updateTimeUI();
    updateComboUI();
    hintTextEl.textContent = "帮猫猫选出主人心里的那个答案～";
  }

  function updateScoreUI() {
    if (scoreValueEl) {
      scoreValueEl.textContent = String(state.score);
    }
  }

  function updateTimeUI() {
    if (timeValueEl) {
      const t = Math.max(0, state.remainingTime);
      timeValueEl.textContent = t.toFixed(1);
    }
  }

  function updateComboUI() {
    if (comboValueEl) {
      comboValueEl.textContent = String(state.combo);
    }
    hudItems.forEach((item) => {
      item.classList.remove("combo-active");
    });
    if (state.combo >= 2 && hudItems[2]) {
      hudItems[2].classList.add("combo-active");
    }
  }

  function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function setupCard(cardEl, type) {
    if (!cardEl) return;
    cardEl.dataset.type = type;
    cardEl.classList.remove("correct", "wrong", "choice-card--carrot", "choice-card--tissue");
    if (type === "carrot") {
      cardEl.classList.add("choice-card--carrot");
    } else {
      cardEl.classList.add("choice-card--tissue");
    }
    const labelEl = cardEl.querySelector(".card-label");
    if (!labelEl) return;

    if (type === "carrot") {
      labelEl.innerHTML = "萝卜<span class=\"en\">carrot</span>";
      cardEl.setAttribute("aria-label", "选择萝卜");
    } else {
      labelEl.innerHTML = "纸巾<span class=\"en\">tissue</span>";
      cardEl.setAttribute("aria-label", "选择纸巾");
    }
  }

  function spawnRound() {
    if (state.gameState !== "playing") return;

    const correct = Math.random() < 0.5 ? "carrot" : "tissue";
    state.currentCorrectType = correct;

    if (correct === "carrot") {
      questionTextEl.textContent = "主人：帮我拍一拍萝卜～";
      // 播放萝卜相关音频
      playRandomAudio("carrot");
    } else {
      questionTextEl.textContent = "主人：纸巾在哪儿？帮我选出来！";
      // 播放纸巾相关音频
      playRandomAudio("paper");
    }

    const firstType = Math.random() < 0.5 ? correct : (correct === "carrot" ? "tissue" : "carrot");
    const secondType = firstType === "carrot" ? "tissue" : "carrot";

    setupCard(cardLeft, firstType);
    setupCard(cardRight, secondType);
  }

  function showPraiseOverlay() {
    if (!overlayPraise) return;
    overlayPraise.classList.add("show");
    if (state.combo >= 2 && comboFireText) {
      comboFireText.textContent = ` ${state.combo} 连击`;
    } else if (comboFireText) {
      comboFireText.textContent = "继续保持～";
    }
    setTimeout(() => {
      overlayPraise.classList.remove("show");
    }, 420);
  }

  function handleCardSelect(cardEl) {
    if (!cardEl || state.gameState !== "playing" || state.inputLocked) return;
    const type = cardEl.dataset.type;
    if (!type) return;
    state.inputLocked = true;

    const isCorrect = type === state.currentCorrectType;

    if (isCorrect) {
      state.combo += 1;
      state.praiseCount += 1;
      if (state.combo > state.maxCombo) {
        state.maxCombo = state.combo;
      }
      const multiplier = 1 + Math.floor(state.combo / 3);
      const gained = 100 * multiplier;
      state.score += gained;
      updateScoreUI();
      updateComboUI();
      hintTextEl.textContent = randomFrom(PRAISE_TEXTS);
      cardEl.classList.add("correct");
      // 播放正确选择的音频
      playRandomAudio("good");
      showPraiseOverlay();
    } else {
      state.combo = 0;
      updateComboUI();
      hintTextEl.textContent = randomFrom(WRONG_TEXTS);
      cardEl.classList.add("wrong");
      // 播放错误选择的音频
      playRandomAudio("wrong");
    }

    setTimeout(() => {
      cardEl.classList.remove("correct", "wrong");
      state.inputLocked = false;
      spawnRound();
    }, isCorrect ? 420 : 300);
  }

  function gameLoop(timestamp) {
    if (state.gameState !== "playing") return;
    if (state.lastFrameTs == null) {
      state.lastFrameTs = timestamp;
    }
    let delta = (timestamp - state.lastFrameTs) / 1000;
    if (delta > 0.3) delta = 0.3;
    state.lastFrameTs = timestamp;

    state.remainingTime -= delta;
    if (state.remainingTime <= 0) {
      state.remainingTime = 0;
      updateTimeUI();
      endGame();
      return;
    }

    updateTimeUI();
    state.rafId = window.requestAnimationFrame(gameLoop);
  }

  function startGame() {
    resetState();
    switchScreen("playing");
    spawnRound();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    state.lastFrameTs = null;
    state.rafId = window.requestAnimationFrame(gameLoop);
  }

  function endGame() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    const remainingWhole = Math.max(0, Math.round(state.remainingTime));
    const timeBonus = remainingWhole * 10;
    const finalScore = Math.max(0, state.score + timeBonus);

    state.lastResult = {
      finalScore,
      timeBonus,
      remainingSeconds: remainingWhole,
      praiseCount: state.praiseCount,
      maxCombo: state.maxCombo
    };

    const bestPreviousRaw = localStorage.getItem(STORAGE_KEYS.bestScore);
    const bestPrevious = bestPreviousRaw ? parseInt(bestPreviousRaw, 10) || 0 : 0;
    const bestNow = Math.max(bestPrevious, finalScore);
    localStorage.setItem(STORAGE_KEYS.bestScore, String(bestNow));

    finalScoreEl.textContent = String(finalScore);
    bestComboEl.textContent = String(state.maxCombo);
    praiseCountEl.textContent = String(state.praiseCount);
    timeBonusEl.textContent = String(timeBonus);
    remainSecEl.textContent = String(remainingWhole);
    if (bestScoreOverallEl) {
      bestScoreOverallEl.textContent = String(bestNow);
    }

    switchScreen("ended");
  }

  function toggleMute() {
    state.muted = !state.muted;
    try {
      localStorage.setItem(STORAGE_KEYS.muted, state.muted ? "1" : "0");
    } catch (e) {
      // ignore storage errors
    }
    if (muteToggle) {
      muteToggle.dataset.muted = state.muted ? "true" : "false";
    }
    if (muteIcon) {
      muteIcon.textContent = state.muted ? "volume_off" : "volume_up";
    }
    showToast(state.muted ? "已静音，猫猫小声夸你~" : "音效已开启，选对就大声夸！");
  }

  function restoreSettings() {
    try {
      const muted = localStorage.getItem(STORAGE_KEYS.muted);
      state.muted = muted === "1";
    } catch (e) {
      state.muted = false;
    }
    if (muteToggle) {
      muteToggle.dataset.muted = state.muted ? "true" : "false";
    }
    if (muteIcon) {
      muteIcon.textContent = state.muted ? "volume_off" : "volume_up";
    }

    try {
      const bestRaw = localStorage.getItem(STORAGE_KEYS.bestScore);
      const best = bestRaw ? parseInt(bestRaw, 10) || 0 : 0;
      if (bestScoreOverallEl) {
        bestScoreOverallEl.textContent = String(best);
      }
    } catch (e) {
      if (bestScoreOverallEl) bestScoreOverallEl.textContent = "0";
    }
  }

  function shareResult() {
    const r = state.lastResult;
    const text = `我在「萝卜 vs 纸巾：真棒挑战」里被夸了 ${r.praiseCount} 次，拿到 ${r.finalScore} 分，最高 ${r.maxCombo} 连击，你也来瞎蒙一把？`;

    if (navigator.share) {
      navigator
        .share({
          title: "萝卜 vs 纸巾：真棒挑战",
          text,
          url: window.location.href
        })
        .catch(() => {
          // 用户取消分享无需提示
        });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          showToast("分享文案已复制，去粘贴给好友吧～");
        })
        .catch(() => {
          showToast("可以手动截图或复制当前页面链接分享给朋友哦～");
        });
    } else {
      showToast("可以截图或用浏览器菜单把这页分享给朋友～");
    }
  }

  function bindEvents() {
    if (btnStart) {
      btnStart.addEventListener("click", () => {
        ensureAudioCtx();
        startGame();
      });
    }
    if (btnRestart) {
      btnRestart.addEventListener("click", () => {
        ensureAudioCtx();
        startGame();
      });
    }
    if (btnShare) {
      btnShare.addEventListener("click", () => {
        shareResult();
      });
    }
    if (muteToggle) {
      muteToggle.addEventListener("click", () => {
        ensureAudioCtx();
        toggleMute();
      });
    }

    const cardHandler = (ev) => {
      ev.preventDefault();
      const target = ev.currentTarget;
      handleCardSelect(target);
    };

    [cardLeft, cardRight].forEach((card) => {
      if (!card) return;
      card.addEventListener("click", cardHandler);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.gameState === "playing") {
        if (state.rafId) {
          cancelAnimationFrame(state.rafId);
          state.rafId = null;
        }
      } else if (!document.hidden && state.gameState === "playing" && !state.rafId) {
        state.lastFrameTs = performance.now();
        state.rafId = window.requestAnimationFrame(gameLoop);
      }
    });
  }

  function init() {
    restoreSettings();
    switchScreen("start");
    resetState();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
