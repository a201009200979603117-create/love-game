"use strict";
// 背景音樂
const bgm = new Audio("audio/bgm.mp3");
bgm.loop = true;
bgm.preload = "auto";

// 按鈕點擊音效：預先載入一次，之後用 cloneNode 重複播放，避免每次都重新建立 Audio
const clickSoundBase = new Audio("audio/click.mp3");
clickSoundBase.preload = "auto";

function playClickSound() {
    const sound = clickSoundBase.cloneNode();
    sound.volume = gameSettings.sfxVolume / 100;
    sound.play().catch(() => {
        // 音效檔不存在或瀏覽器尚未允許播放時，靜默略過
    });
}

// 套用背景音樂音量
function updateBgmVolume() {
    bgm.volume = gameSettings.musicVolume / 100;
}

// 手機瀏覽器可能擋下自動播放：遊戲進行中，第一次觸控／點擊時再嘗試啟動音樂
let gameStarted = false;

document.addEventListener("pointerdown", () => {
    if (gameStarted && bgm.paused) {
        bgm.play().catch(() => {});
    }
});

// ========================================
// 遊戲內提示（取代 alert，不會打斷打字動畫）
// ========================================

let toastTimer = null;

function showToast(message, duration = 3200) {
    const toast = document.getElementById("game-toast");

    if (!toast) {
        console.info(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
        toastTimer = null;
    }, duration);
}

function hideToast() {
    const toast = document.getElementById("game-toast");

    clearTimeout(toastTimer);
    toastTimer = null;

    if (toast) {
        toast.classList.remove("show");
    }
}

// ========================================
// 1. 遊戲變數
// ========================================

let affection = 0;
let trust = 0;
let dialogueStep = 0;
let currentSceneIndex = 0;
let hasChosen = false;
let hiddenEndingUnlocked = false;
let specialChoices = new Set();

// 記錄玩家的重要劇情選擇
let storyFlags = new Set();

// 記錄目前與柳如煙的關係狀態
let relationshipStage = "normal";

// 更新關係狀態
function updateRelationshipStage() {
    if (affection >= 70) {
        relationshipStage = "close";
    } else if (affection >= 40) {
        relationshipStage = "normal";
    } else {
        relationshipStage = "distant";
    }
}

// 根據玩家過去的選擇，取得不同的劇情文字
// variations 內的 key 順序就是優先順序（寫在前面的優先），
// 不再受玩家選擇的先後順序影響。
function getStoryText(normalText, variations = {}) {
    for (const key of Object.keys(variations)) {
        if (key === "distant" || key === "close") continue;

        if (storyFlags.has(key)) {
            return variations[key];
        }
    }

    // 沒有特殊選擇時，依照關係狀態顯示
    if (
        relationshipStage === "distant" &&
        variations.distant
    ) {
        return variations.distant;
    }

    if (
        relationshipStage === "close" &&
        variations.close
    ) {
        return variations.close;
    }

    return normalText;
}

// 已發現的解謎線索
let discoveredClues = new Set();
// 已解開的謎題
let solvedPuzzles = new Set();

// 線索資料
const clueData = {
    old_photo: {
        name: "舊照片",
        description: "照片裡有兩個孩子，背面寫著一個未完成的約定。日期雖然模糊，但有一欄年份後面寫著[已知有兩個正整數a,b滿足下列兩了個條件][1.兩數的最小公倍數(LCM)與最大公因數(GCD)之和等於 203515][2.兩數之和a + b = 2416]。"
    },
    mysterious_letter: {
        name: "神祕信件",
        description: "一封沒有寄出的信，可能藏著約定的真正原因。信末寫著：「真正重要的，不是你記得多少，而是你是否願意再次11100101 10101111 10001011 11100110 10001001 10101100,不知為何這兩個字是寫二進制,但你身為主角應該能解開吧。」"
    },
    past_memory: {
        name: "遺失的回憶",
        description: "從童年片段中拼湊出來的記憶。"
    }
};

// 收集線索
function collectClue(clueId) {
    if (!clueData[clueId]) {
        return;
    }

    if (discoveredClues.has(clueId)) {
        return;
    }

    discoveredClues.add(clueId);

    showToast(
        "✦ 發現新線索：" + clueData[clueId].name +
        "（可在「🔍 解謎」查看）"
    );
}

let currentPuzzle = null;

// 統一答案格式：去除空白、全形轉半形、轉小寫
function normalizeAnswer(text) {
    return String(text)
        .replace(/[！-～]/g, ch =>
            String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
        )
        .replace(/　/g, " ")
        .replace(/\s+/g, "")
        .toLowerCase();
}

// 開始解謎：改用遊戲內的輸入區
// correctAnswer 可以是字串，也可以是多個可接受答案的陣列
function solvePuzzle(puzzleId, question, correctAnswer) {
    if (solvedPuzzles.has(puzzleId)) {
        showToast("你已經解開這道謎題了！");
        updatePuzzleStatus();
        return;
    }

    currentPuzzle = {
        id: puzzleId,
        answers: (Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer])
            .map(normalizeAnswer)
    };

    const title = document.getElementById("puzzle-question-title");
    const questionText = document.getElementById("puzzle-question-text");
    const answerInput = document.getElementById("puzzle-answer-input");
    const answerArea = document.getElementById("puzzle-answer-area");
    const feedback = document.getElementById("puzzle-feedback");

    if (!title || !questionText || !answerInput || !answerArea || !feedback) {
        showToast("找不到解謎輸入區，請確認 index.html 已加入答案輸入區。");
        return;
    }

    title.textContent = "🔍 " + question.split("\n")[0].replace(/[【】]/g, "");
    questionText.textContent = question;
    answerInput.value = "";
    feedback.textContent = "";
    feedback.style.color = "#c5c0dc";

    answerArea.style.display = "block";
    answerInput.focus();
}

// 確認答案
function submitPuzzleAnswer() {
    if (!currentPuzzle) return;

    const answerInput = document.getElementById("puzzle-answer-input");
    const feedback = document.getElementById("puzzle-feedback");

    const answer = normalizeAnswer(answerInput.value);

    if (!answer) {
        feedback.textContent = "請先輸入答案。";
        feedback.style.color = "#ffcf8a";
        return;
    }

    if (currentPuzzle.answers.includes(answer)) {
        solvedPuzzles.add(currentPuzzle.id);

        feedback.textContent = "✦ 解謎成功！你離真相又近了一步。";
        feedback.style.color = "#a8f0c6";

        updatePuzzleStatus();
        currentPuzzle = null;
    } else {
        feedback.textContent = "答案不正確，再仔細想想線索吧。";
        feedback.style.color = "#ffaaa9";
    }
}

// 返回謎題列表
function cancelPuzzleAnswer() {
    const answerArea = document.getElementById("puzzle-answer-area");

    if (answerArea) {
        answerArea.style.display = "none";
    }

    currentPuzzle = null;
}


function solvePhotoPuzzle() {
    // 必須先取得舊照片線索
    if (!discoveredClues.has("old_photo")) {
        showToast("你還沒有找到舊照片，無法解開這道謎題。");
        return;
    }

    solvePuzzle(
        "photo_date",
        "【舊照片之謎】\n\n照片背面的約定日期已經模糊不清。請翻閱「線索筆記」裡的舊照片，推測約定的年份。\n\n請輸入年份（西元四位數）：",
        "2015"
    );
}

function solveLetterPuzzle() {
    // 必須先找到神祕信件
    if (!discoveredClues.has("mysterious_letter")) {
        showToast("你還沒有找到神祕信件，無法解開這道謎題。");
        return;
    }

    solvePuzzle(
        "letter_secret",
        "【神祕信件之謎】\n\n信件裡留下了一句話：\n「真正重要的，不是你記得多少，而是你是否願意再次尋找。」\n\n請輸入這句話的核心答案（兩個字）：",
        ["尋找", "再次尋找"]
    );
}

/* ==============================
   解謎視窗控制
============================== */

// 開啟解謎視窗
function openPuzzleModal() {
    const modal = document.getElementById("puzzle-modal");

    if (!modal) return;

    cancelPuzzleAnswer();
    modal.style.display = "flex";
    showPuzzleTab("clues");
}

// 關閉解謎視窗
function closePuzzleModal() {
    const modal = document.getElementById("puzzle-modal");

    if (modal) {
        modal.style.display = "none";
    }
}

// 切換分頁
function showPuzzleTab(tab) {
    const cluePage = document.getElementById("puzzle-clues");
    const puzzlePage = document.getElementById("puzzle-list");
    const tabs = document.querySelectorAll(".puzzle-tab");

    if (!cluePage || !puzzlePage) return;

    cluePage.style.display = tab === "clues" ? "block" : "none";
    puzzlePage.style.display = tab === "puzzles" ? "block" : "none";

    tabs.forEach(button => {
        button.classList.remove("active");
    });

    const activeIndex = tab === "clues" ? 0 : 1;

    if (tabs[activeIndex]) {
        tabs[activeIndex].classList.add("active");
    }

    if (tab === "clues") {
        renderPuzzleClues();
    }

    updatePuzzleStatus();
}

// 顯示已收集的線索
function renderPuzzleClues() {
    const container = document.getElementById("puzzle-clue-list");

    if (!container) return;

    container.innerHTML = "";

    const clues = Array.from(discoveredClues);

    if (clues.length === 0) {
        container.innerHTML =
            '<div class="puzzle-empty">✦<br>目前還沒有找到任何線索。<br>探索校園，尋找被遺忘的回憶吧。</div>';
        return;
    }

    clues.forEach(clueId => {
        const clue = clueData[clueId];

        if (!clue) return;

        const card = document.createElement("div");
        card.className = "puzzle-clue-card";

        const title = document.createElement("h3");
        title.textContent = "✦ " + clue.name;

        const description = document.createElement("p");
        description.textContent = clue.description;

        card.appendChild(title);
        card.appendChild(description);
        container.appendChild(card);
    });
}

// 更新謎題狀態
function updatePuzzleStatus() {
    const photoStatus = document.getElementById("photo-puzzle-status");
    const letterStatus = document.getElementById("letter-puzzle-status");

    if (photoStatus) {
        photoStatus.textContent = solvedPuzzles.has("photo_date")
            ? "✓ 已解開"
            : "尚未解開";
    }

    if (letterStatus) {
        letterStatus.textContent = solvedPuzzles.has("letter_secret")
            ? "✓ 已解開"
            : "尚未解開";
    }
}

let typingTimer = null;
let afterTyping = null;      // 文字顯示完畢後要執行的動作（例如顯示選項）
let backgroundTimer = null;  // 背景切換用的計時器
let currentText = "";
let endingCgStep = 0;
let currentEndingText = "";
let endingTimer = null;

// ========================================
// 遊戲設定
// ========================================

const gameSettings = {
    textSpeed: 3,
    musicVolume: 50,
    sfxVolume: 70,
    typewriter: true
};

const textSpeedMap = {
    1: 80,
    2: 55,
    3: 35,
    4: 20,
    5: 10
};

const textSpeedLabels = {
    1: "非常慢",
    2: "慢",
    3: "普通",
    4: "快",
    5: "非常快"
};

const MAX_AFFECTION = 100;
const MAX_TRUST = 100;

// 劇情資料裡每個選項的數值加總偏高（好感最多 158、信任最少 113），
// 很容易全滿，結局失去區分度，所以統一依比例縮放。
const AFFECTION_SCALE = 0.6;
const TRUST_SCALE = 0.5;

// 結局門檻（依縮放後的數值，經過模擬：多數選擇偏向友善的玩家會拿到好結局，
// 選擇混合的玩家是普通結局，多數選擇偏向冷淡的玩家才會是失敗結局）
const ENDING_RULES = {
    goodAffection: 72,
    goodTrust: 78,
    badAffection: 55,
    badTrust: 66
};

// ========================================
// 2. 劇情資料
// ========================================

// ========================================
// 場景背景宣告
// ========================================
// 劇情裡用到的「每一個」背景都先宣告在這裡：名稱 → 圖片路徑。
// 之後只要把圖片放進 images 資料夾（檔名與下方相同），遊戲就會自動改用它，
// 不需要再改任何程式。
//
//   名稱                          圖片檔                                 用在哪裡
const sceneBackgrounds = {
    classroom:                   "images/classroom.png",                  // 教室（白天）
    classroom_sunset:            "images/classroom_sunset.png",           // 教室（放學後夕陽）
    hallway:                     "images/hallway.png",                    // 走廊、樓梯口
    school:                      "images/school.png",                     // 校園一般場景
    school_store:                "images/school_store.png",               // 福利社
    library:                     "images/library.png",                    // 圖書館（白天）
    school_library_evening:      "images/school_library_evening.png",     // 圖書館（傍晚整理資料）
    rainy_school:                "images/rainy_school.png",               // 雨天的校園
    playground:                  "images/playground.png",                 // 操場、老樹
    event_classroom:             "images/event_classroom.png",            // 活動教室
    bedroom:                     "images/bedroom.png",                    // 主角的房間（夜晚）
    dream_campus:                "images/dream_campus.png",               // 夢境中的校園與老樹
    ruyan_childhood_room:        "images/ruyan_childhood_room.png",       // 柳如煙家裡
    old_community_center:        "images/old_community_center.png",       // 老社區活動中心外觀
    old_center_room:             "images/old_center_room.png",            // 活動中心走廊／房間
    old_center_storage:          "images/old_center_storage.png",         // 活動中心儲藏室
    old_center_window_rain:      "images/old_center_window_rain.png",     // 儲藏室窗外下雨
    old_center_office:           "images/old_center_office.png",          // 活動中心辦公室
    old_center_archive:          "images/old_center_archive.png",         // 活動中心資料室
    local_history_archive:       "images/local_history_archive.png",      // 地方文史資料室
    riverside_evening:           "images/riverside_evening.png",          // 傍晚的河堤
    old_observatory_platform:    "images/old_observatory_platform.png",   // 舊觀景台
    old_neighborhood_park:       "images/old_neighborhood_park.png",      // 老公園與老樹
    old_neighborhood_park_night: "images/old_neighborhood_park_night.png",// 老公園（夜晚）
    childhood_memory_rain:       "images/childhood_memory_rain.png",      // 童年回憶（雨中老樹）
    starry_sky_ending:           "images/starry_sky_ending.png"           // 結尾星空
};

// 還沒有圖片時，先借用相近的背景（找不到檔案才會用到）。
// 新增圖片之後不用改這裡，遊戲會優先使用自己的圖片。
const backgroundFallbacks = {
    classroom_sunset: "classroom",
    school_store: "hallway",
    school_library_evening: "library",
    event_classroom: "classroom",
    bedroom: "classroom",
    dream_campus: "playground",
    ruyan_childhood_room: "classroom",
    old_community_center: "school",
    old_center_room: "school",
    old_center_storage: "library",
    old_center_window_rain: "rainy_school",
    old_center_office: "old_center_room",
    old_center_archive: "library",
    local_history_archive: "library",
    riverside_evening: "playground",
    old_observatory_platform: "playground",
    old_neighborhood_park: "playground",
    old_neighborhood_park_night: "old_neighborhood_park",
    childhood_memory_rain: "rainy_school",
    starry_sky_ending: "old_neighborhood_park_night",
    hallway: "school",
    school: "classroom",
    library: "classroom",
    rainy_school: "school",
    playground: "school"
};

// 所有背景都找不到時使用的最後備援圖片
const DEFAULT_BACKGROUND = "images/Main_Screen.png";

// 預先檢查哪些圖片真的存在：名稱 → true（有圖）／false（沒有圖）
const backgroundAvailability = {};

function preloadBackgrounds() {
    Object.keys(sceneBackgrounds).forEach(name => {
        const img = new Image();

        img.onload = () => {
            backgroundAvailability[name] = true;
            refreshBackgroundIfCurrent(name);
        };

        img.onerror = () => {
            backgroundAvailability[name] = false;
        };

        img.src = sceneBackgrounds[name];
    });

    const fallbackImg = new Image();
    fallbackImg.src = DEFAULT_BACKGROUND;
}

// 找出實際要顯示的圖片：自己的圖片 → 替代背景 → 最後備援
function getBackgroundPath(name) {
    const visited = new Set();
    let current = name;

    while (current && !visited.has(current)) {
        visited.add(current);

        if (sceneBackgrounds[current] && backgroundAvailability[current] === true) {
            return sceneBackgrounds[current];
        }

        current = backgroundFallbacks[current];
    }

    return DEFAULT_BACKGROUND;
}

preloadBackgrounds();

const storyScenes = [
    // ==============================
    // 第一章：轉學生的秘密
    // ==============================

    // 第 1 段：初次相遇
    // 第 1 段（1/2 幕）
    {
        name: "旁白",
        background: "classroom",
        text: "九月的早晨，陽光穿過教室的窗戶。班導帶著一名陌生的少女走進教室。班導說她叫做柳如煙，她有著安靜的氣質，手裡抱著幾本課本。",
        choices: []
    },
    // 第 1 段（2/2 幕）
    {
        name: "旁白",
        background: "classroom",
        text: "當她看向你時，腳步似乎停頓了一瞬，但很快又恢復平靜。",
        choices: [
            {
                text: "主動自我介紹，歡迎她加入班級",
                affection: 3,
                trust: 0,
                expression: "happy",
                response: "少女似乎沒料到你會主動開口。她輕輕點頭，露出淡淡的笑容。「你好，我叫柳如煙。以後請多多指教。」",
                special: "first_greeting",
                flag: "welcomed_ruyan"
            },
            {
                text: "注意到她剛才的停頓，詢問是不是有事",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: "柳如煙微微一怔，隨即搖頭。「沒事，只是第一次來新環境，有點不習慣。」她把課本抱得更緊了一些。",
                special: "noticed_familiarity",
                flag: "noticed_her_reaction"
            }
        ]
    },
    // 第 2 段：奇怪的名字
    {
        name: "柳如煙",
        background: "classroom",
        text: "老師安排柳如煙坐在你附近。整理座位時，她忽然輕聲念了一次你的名字。你轉頭看她，她立刻把視線移回課本。",
        choices: [
            {
                text: "直接問她怎麼知道自己的名字",
                affection: 2,
                trust: 0,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("noticed_her_reaction")) {
                        return "「老師剛剛點名的時候有說呀。」柳如煙回答得很快。你注意到，她似乎早就準備好這個答案，卻又不太敢看你的眼睛。";
                    }

                    return "「老師剛剛點名的時候有說呀。」柳如煙回答得很快，接著笑了笑。「你的名字還滿好記的。」";
                },
                special: "asked_name",
                flag: "asked_how_she_knew_name"
            },
            {
                text: "先不追問，繼續整理自己的東西",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: "你沒有追問。柳如煙偷偷看了你一眼，隨後拿起筆，在筆記本角落畫了一個小小的星星。她看著那顆星星發了一會兒呆，才默默把它圈了起來。",
                special: "observed_star",
                flag: "noticed_star_drawing"
            }
        ]
    },
    // 第 3 段：借課本
    {
        name: "柳如煙",
        background: "classroom",
        text: "第一節課開始前，柳如煙發現自己的課本還沒領齊。她猶豫了一會兒，才開口問你能不能一起看。",
        choices: [
            {
                text: "把課本移到中間，自然地和她一起看",
                affection: 3,
                trust: 1,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("welcomed_ruyan")) {
                        return "你把課本移到兩人中間，笑著說：「反正坐得近，一起看比較方便。」柳如煙放鬆了些，椅子也稍微靠近。「謝謝你。對了，你放學後通常都做些什麼？」";
                    }

                    return "你把課本移到兩人中間，示意她不用客氣。柳如煙輕輕點頭，椅子稍微靠近了一些。「謝謝你。對了，你放學後通常都做些什麼？」";
                },
                special: "shared_textbook",
                flag: "shared_textbook"
            },
            {
                text: "答應借她看，順便問她適不適應新學校",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("noticed_her_reaction")) {
                        return "「目前還好，就是有些地方還不熟悉。」柳如煙停頓了一下，像是想說些什麼，最後卻只望向窗外。「希望能快點認識新朋友。」你感覺她說的似乎不只是新學校的事。";
                    }

                    return "柳如煙笑著說：「目前還好，就是有些地方還不熟悉。」她看了看窗外，又補了一句：「希望能快點認識新朋友。」";
                },
                special: "asked_transfer_reason",
                flag: "asked_about_new_school"
            }
        ]
    },
    // 第 4 段：不熟悉的旋律
    {
        name: "旁白",
        background: "hallway",
        text: "下課後，你在走廊遇見柳如煙。她戴著耳機，輕輕哼著一段旋律。那旋律很簡單，聽起來有些懷舊。當她發現你站在旁邊，便停了下來。",
        choices: [
            {
                text: "詢問那段旋律是從哪裡聽來的",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("noticed_star_drawing")) {
                        return "「是以前聽過的一段旋律，我也不知道歌名。」柳如煙摘下耳機。你想起她在筆記本上畫過的星星，忽然覺得這段旋律和那顆星星，似乎都藏著某種你不知道的故事。";
                    }

                    return "「是以前聽過的一段旋律，我也不知道歌名。」柳如煙摘下耳機。「有時候明明很久沒聽，卻還是會記得。」她說完後，像是連自己也不明白為什麼會記得。";
                },
                special: "heard_melody",
                flag: "asked_melody_origin"
            },
            {
                text: "開玩笑說她哼得還不錯",
                affection: 3,
                trust: 0,
                expression: "happy",
                response: "柳如煙愣了一下，隨後有些不好意思地笑了。「你不要突然稱讚我啦，我只是隨便哼哼而已。」她重新戴上耳機，走了幾步，卻又回頭問：「你真的覺得好聽嗎？」",
                special: "remembered_melody",
                flag: "praised_her_melody"
            }
        ]
    },
    // 第 5 段：福利社的選擇
    {
        name: "柳如煙",
        background: "school_store",
        text: "午休時，你和柳如煙一起走到福利社。她在飲料櫃前看了一會兒，最後拿起一瓶包裝簡單的汽水。「這個味道還不錯。」她說。",
        choices: [
            {
                text: "買同款飲料，和她一起分享午休時光",
                affection: 3,
                trust: 1,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("praised_her_melody")) {
                        return "你拿起同款汽水，笑著說：「那我也試試看。」柳如煙想起你剛才稱讚她哼歌的事，笑著問：「你是不是很容易被別人推薦的東西吸引？」你們一邊聊天，一邊走回教室。";
                    }

                    return "你拿起同款汽水。柳如煙看著你手上的飲料，笑了起來。「你也喜歡這個嗎？那下次可以一起來買。」她說得自然，像是已經把這件小事記在心裡。";
                },
                special: "shared_drink",
                flag: "shared_drink"
            },
            {
                text: "推薦另一種飲料，也說說自己的喜好",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: "你推薦了另一種飲料，順便說明自己喜歡它的原因。柳如煙認真聽完，笑著搖頭。「聽起來不錯，下次再試試看吧，今天我還是想喝原本這個。」她沒有勉強自己接受你的推薦，反而好奇地問起你為什麼喜歡那個味道。",
                special: "kept_preference",
                flag: "shared_different_preferences"
            }
        ]
    },
    // 第 6 段：忘記帶的東西
    {
        name: "旁白",
        background: "classroom",
        text: "下午上課前，柳如煙翻遍了筆袋，卻找不到自己的橡皮擦。她轉頭看向你，似乎有點不好意思。",
        choices: [
            {
                text: "直接把橡皮擦借給她",
                affection: 2,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("shared_textbook")) {
                        return "你把橡皮擦遞給她。「又欠你一次了。」柳如煙接過橡皮擦，笑著說：「看來跟你坐附近真的很方便。」她用便利貼寫下你的名字，貼在橡皮擦上，像是怕自己忘記歸還。";
                    }

                    return "「先用我的吧。」你把橡皮擦遞給她。柳如煙鬆了口氣，認真地放在桌角，還特地用便利貼寫下你的名字。「謝謝你，明天我一定還你。」";
                },
                special: "lent_eraser",
                flag: "lent_eraser"
            },
            {
                text: "提醒她下次記得檢查文具",
                affection: 1,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("shared_different_preferences")) {
                        return "你提醒她下次上課前先檢查文具。柳如煙看了你一眼，忍不住笑了。「你講話怎麼跟老師一樣？」停了一下，她又補充：「不過，你好像真的很在意這些小事。」";
                    }

                    return "「下次上課前記得檢查一下筆袋吧。」你提醒她。柳如煙小聲回答：「知道了啦。」接著忍不住笑了。「你講話怎麼跟老師一樣？」";
                },
                special: "reminded_supplies",
                flag: "reminded_supplies"
            }
        ]
    },
    // 第 7 段：圖書館的舊書
    {
        name: "旁白",
        background: "library",
        text: "放學前，你到圖書館尋找參考書。經過角落的書架時，你發現柳如煙正蹲著找一本舊校刊。她翻得很仔細，直到你走近才發現你在旁邊。",
        choices: [
            {
                text: "先打招呼，再問她為什麼找舊校刊",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("asked_melody_origin")) {
                        return "「我在找以前的校園活動紀錄。」柳如煙把校刊翻到某一頁，指尖停在一張模糊的活動照片上。「有些事情明明記不清楚了，卻還是會讓人想找出答案。」她很快合上校刊，沒有繼續解釋。";
                    }

                    return "「我在找以前的校園活動紀錄。」柳如煙把書放回架上。「突然有點好奇以前的學校是什麼樣子。」她說得很平靜，卻沒有立刻離開書架。";
                },
                special: "library_search",
                flag: "asked_about_old_yearbook"
            },
            {
                text: "問她需不需要幫忙找",
                affection: 2,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("noticed_star_drawing")) {
                        return "「不用啦，我快找到了。」柳如煙笑著回答。你瞥見校刊裡有一張星空活動的照片，她立刻把頁面闔上，像是不想讓你看見。過了一會兒，她才小聲說：「謝謝你願意幫忙。」";
                    }

                    return "「不用啦，我快找到了。」柳如煙笑著回答。她合上手中的校刊，卻又忍不住回頭看了一眼，似乎還有什麼沒找到。";
                },
                special: "noticed_year",
                flag: "offered_help_with_yearbook"
            }
        ]
    },
    // 第 8 段：午餐的話題
    {
        name: "柳如煙",
        background: "classroom",
        text: "午餐時間，班上同學正熱烈討論週末要去哪裡玩。柳如煙安靜地聽著，偶爾點頭。當你問她的意見時，她似乎有些意外。",
        choices: [
            {
                text: "邀請她週末一起去書店",
                affection: 3,
                trust: 1,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("asked_about_old_yearbook")) {
                        return "「書店嗎？好像不錯。」柳如煙想了一下，又問：「那裡會有舊書區嗎？」她似乎對這個提議特別感興趣，但很快又補了一句：「如果時間可以，我很想去看看。」";
                    }

                    return "「書店嗎？好像不錯。」柳如煙想了一下。「如果時間可以，我很想去看看。」她沒有立刻答應，卻開始和你討論附近有哪些書店。";
                },
                special: "invited_bookstore",
                flag: "invited_her_bookstore"
            },
            {
                text: "問她平常最喜歡做什麼",
                affection: 2,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("shared_different_preferences")) {
                        return "「看書、聽音樂，有時候也會出去散步。」柳如煙看向你。「每個人喜歡的東西都不太一樣吧？我覺得慢慢了解也不錯。那你呢？有沒有什麼特別喜歡的事情？」";
                    }

                    return "「看書、聽音樂，有時候也會出去散步。」她看向你。「那你呢？有沒有什麼特別喜歡的事情？」這次她沒有急著結束話題，而是認真等著你的回答。";
                },
                special: "asked_hobbies",
                flag: "learned_her_hobbies"
            }
        ]
    },
    // 第 9 段：放學後的約定
    {
        name: "旁白",
        background: "hallway",
        text: "放學後，你和柳如煙一起走到樓梯口。她看著逐漸暗下來的天空，忽然問：「你覺得，一個人小時候喜歡的東西，長大以後還會喜歡嗎？」",
        choices: [
            {
                text: "回答有些喜歡的東西會一直保留下來",
                affection: 2,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (
                        storyFlags.has("noticed_star_drawing") ||
                        storyFlags.has("asked_melody_origin")
                    ) {
                        return "柳如煙安靜了一會兒，輕輕點頭。「我也這麼覺得。有些習慣就算很久沒做，也不會真的消失。」她下意識地敲了敲手指，像是在回想什麼，隨後又把話題帶開。";
                    }

                    return "柳如煙點了點頭。「我也這麼覺得。有些習慣就算很久沒做，也不會真的消失。」她看著遠處的天空，似乎想起了某件很久以前的事。";
                },
                special: "believed_promise",
                flag: "believed_old_habits"
            },
            {
                text: "回答人長大後可能會改變，不必一直留戀過去",
                affection: -1,
                trust: -2,
                expression: "normal",
                response: "「也是。」柳如煙的笑容淡了一些。「人確實會變。」她停頓片刻，低頭整理書包。「有時候，就算自己還記得，也不代表別人會記得。」說完，她沒有再繼續這個話題。",
                special: "questioned_promise",
                flag: "questioned_old_habits"
            }
        ]
    },
    // 第 10 段：雨中的熟悉感
    {
        name: "旁白",
        background: "rainy_school",
        text: "隔天下午，放學鐘聲響起時，天空突然下起大雨。你和柳如煙被困在教學樓的走廊。她望著雨幕，似乎很喜歡雨滴落在地面的聲音。",
        choices: [
            {
                text: "把傘借給她，自己留下等雨小一點",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("believed_old_habits")) {
                        return "你把傘遞給她，說自己再等一下就好。柳如煙沒有馬上接過傘。「可是你也會淋雨啊。」她望著雨幕，低聲說：「有些人總是只想到別人，卻忘了自己。」最後，她沒有立刻離開，而是陪你一起等雨變小。";
                    }

                    return "你把傘遞給她，說自己再等一下就好。柳如煙接過傘，卻沒有立刻離開。「那你怎麼辦？」她看著你，最後提議等雨小一點再走。雨聲之中，她似乎還有話想說。";
                },
                special: "rain_memory",
                flag: "offered_umbrella"
            },
            {
                text: "提議一起撐傘到公車站",
                affection: 3,
                trust: -1,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("praised_her_melody")) {
                        return "柳如煙愣了一下，隨後點頭。「好啊，那就麻煩你了。」兩人走進雨幕時，她輕輕哼起昨天那段旋律。你想起自己曾稱讚過她的歌聲，她便笑著問：「這次也覺得好聽嗎？」";
                    }

                    return "柳如煙愣了一下，隨後點頭。「好啊，那就麻煩你了。」兩人走進雨幕時，她輕輕哼起昨天那段旋律。只是傘下的距離有些近，她偶爾會往旁邊挪一點，似乎還不太習慣這樣親密的相處。";
                },
                special: "shared_umbrella",
                flag: "shared_umbrella"
            }
        ]
    },
    // 第 11 段：奇怪的夢
    // 第 11 段（1/2 幕）
    {
        name: "旁白",
        background: "bedroom",
        text: "那天晚上，你做了一個奇怪的夢。",
        choices: []
    },
    // 第 11 段（2/2 幕）
    {
        name: "旁白",
        background: "dream_campus",
        text: "夢裡是一座有大樹的校園，你似乎正和某個人說話。但夢裡的聲音模糊不清，醒來後，你只記得那是一個讓人安心的地方。",
        choices: [
            {
                text: "把夢裡的感覺和細節記在手機備忘錄",
                affection: 0,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (
                        storyFlags.has("shared_umbrella") ||
                        storyFlags.has("offered_umbrella")
                    ) {
                        return "你記下夢裡的大樹、模糊的聲音，還有窗外不斷落下的雨。寫到最後，你忽然發現，夢裡那種安心的感覺，和今天放學時聽見的雨聲有些相似。你把這個想法也記了下來。";
                    }

                    return "你記下了夢裡的大樹和模糊的聲音。寫完後，你盯著備忘錄看了一會兒，總覺得自己好像忘了什麼重要的細節，卻怎麼也想不起來。";
                },
                special: "recorded_dream",
                flag: "recorded_dream"
            },
            {
                text: "不再多想，準備隔天上課",
                affection: 1,
                trust: 0,
                expression: "normal",
                response: "你決定先把夢放在一邊。畢竟最近作業不少，也許只是太累了。關掉手機前，你卻莫名想起一個念頭：如果夢裡的人真的存在，那他現在會在哪裡？你沒有繼續追想，躺回床上準備休息。",
                special: "recalled_voice",
                flag: "put_dream_aside"
            }
        ]
    },
    // 第 12 段：她知道的事情
    {
        name: "柳如煙",
        background: "classroom",
        text: "第二天早上，你到教室時，柳如煙已經坐在位置上。她看見你，忽然問：「你昨天睡得好嗎？」她的目光在你臉上停留片刻，像是在確認什麼，隨後才露出平常的笑容。",
        choices: [
            {
                text: "告訴她自己夢見一座熟悉的大樹校園",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_dream")) {
                        return "「我夢見一座有大樹的校園，還有一個聽不清楚聲音的人。」你打開手機備忘錄，把記下的內容給她看。柳如煙看見「大樹」兩個字時，手指忽然停住。「那棵樹……很大嗎？」她問得很輕。你還沒回答，她便把視線移開。「抱歉，我只是覺得這個夢有點熟悉。」";
                    }

                    return "「我夢見一座有大樹的校園，還有一個聽不清楚聲音的人。」柳如煙原本輕鬆的表情慢慢收了起來。「大樹……」她低聲重複了一次，接著勉強笑道：「可能只是最近太累了吧。」但她沒有解釋自己為什麼在意這個細節。";
                },
                special: "mentioned_star",
                flag: "told_her_about_dream"
            },
            {
                text: "反問她為什麼突然關心自己的睡眠",
                affection: 0,
                trust: -1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("put_dream_aside")) {
                        return "「沒什麼，只是看你今天好像有點累。」柳如煙把早餐放到桌上。「記得吃早餐，不然上課會沒精神。」你沒有提起昨晚的夢，她也沒有繼續追問，只是偶爾望向窗外，像是在等待什麼。";
                    }

                    return "「沒什麼，只是看你今天好像有點累。」柳如煙把早餐放到桌上。「記得吃早餐，不然上課會沒精神。」她的回答很自然，但你注意到，她似乎原本還想問些別的，最後卻把話吞了回去。";
                },
                special: "questioned_dream",
                flag: "questioned_her_concern"
            }
        ]
    },
    // 第 13 段：校園裡的大樹
    {
        name: "旁白",
        background: "playground",
        text: "午休時，你經過操場旁的一棵老樹。柳如煙正站在樹下乘涼。微風吹過，她抬頭看著樹葉，神情難得放鬆。她伸手輕碰樹幹，動作自然得像是早已來過這裡許多次。",
        choices: [
            {
                text: "走近詢問她為什麼喜歡這棵樹",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("told_her_about_dream")) {
                        return "「這裡很安靜。」柳如煙說。你提起昨晚夢裡的大樹，她的手忽然停在樹幹上。「你夢裡的樹……也是這麼粗嗎？」她問完便沉默了。過了一會兒，她才說：「我以前好像也在一棵很大的樹下，等過一個人。」";
                    }

                    return "「這裡很安靜。」柳如煙說。她望著樹幹上的紋路，像是在辨認什麼。「我以前好像也在一棵很大的樹下，等過一個人。」她沒有說出那個人的名字，只輕輕摸了摸樹皮。";
                },
                special: "old_tree",
                flag: "asked_about_old_tree"
            },
            {
                text: "不打擾她，只在旁邊安靜地陪著",
                affection: 2,
                trust: 3,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("questioned_her_concern")) {
                        return "你沒有追問，只在樹下陪她站了一會兒。柳如煙原本還有些拘謹，最後終於放鬆下來。「謝謝你。」她看著樹影，輕聲說：「有些事情，我還不知道該怎麼說。但你願意陪我待一下，我很高興。」";
                    }

                    return "你沒有追問，只在樹下陪她站了一會兒。柳如煙轉頭看著你，露出安心的笑容。「謝謝你，有時候安靜待著也很好。」她低頭用鞋尖輕輕碰了碰地面，無意間敲了幾下自己的手指，像是在整理思緒。";
                },
                special: "quiet_company",
                flag: "stayed_with_her_under_tree"
            }
        ]
    },
    // 第 14 段：臨時的邀請
    {
        name: "柳如煙",
        background: "classroom_sunset",
        text: "放學後，柳如煙收拾好書包，走到你面前。「我想去附近的書店看看，你要一起去嗎？」她說完後，似乎有些在意你的回答。",
        choices: [
            {
                text: "答應和她一起去，順便問她想找什麼書",
                affection: 3,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("asked_about_old_tree")) {
                        return "「真的嗎？太好了。」柳如煙的笑容明顯變得燦爛。你問她想找什麼書，她想了想，說：「也許是一些舊書，或是以前的校園紀錄吧。」她很快又補了一句：「當然，普通的小說我也喜歡。」";
                    }

                    return "「真的嗎？太好了。」柳如煙的笑容明顯變得燦爛。你問她想找什麼書，她回答：「還沒決定，到了再慢慢看吧。」她和你約好時間，便先一步走向校門，走了幾步又回頭確認你有沒有答應好時間。";
                },
                special: "accepted_invitation",
                flag: "accepted_invitation"
            },
            {
                text: "婉拒邀請，並說明今天已有安排",
                affection: -1,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("stayed_with_her_under_tree")) {
                        return "「今天有事嗎？」柳如煙稍微愣了一下，隨後點頭。「好，那你先忙吧。」她沒有勉強你，還提醒你回家路上小心。離開前，她像是想再說些什麼，最後只輕聲補了一句：「下次有空再一起去。」";
                    }

                    return "柳如煙稍微愣了一下，隨後點頭。「沒關係，那下次有機會再一起去吧。」她雖然仍然微笑，卻沒有像剛才那麼雀躍。你說明今天已有安排後，她的神情稍微放鬆，似乎明白你並不是刻意避開她。";
                },
                special: "declined_invitation",
                flag: "declined_invitation"
            }
        ]
    },
    // 第 15 段：奇怪的巧合
    // 第 15 段（1/3 幕）
    {
        name: "旁白",
        background: "classroom",
        text: "幾天後，你在整理課桌時，翻出一本很久以前用過的舊筆記本。裡面有幾頁字跡已經褪色，還畫著一些看不出意思的小圖案。",
        choices: []
    },
    // 第 15 段（2/3 幕）
    {
        name: "旁白",
        background: "classroom",
        text: "其中一頁畫著一顆星星，旁邊還寫著一串模糊的數字。",
        choices: []
    },
    // 第 15 段（3/3 幕）
    {
        name: "旁白",
        background: "classroom",
        text: "你盯著它看了幾秒，腦海裡忽然閃過一個模糊的畫面：好像曾經有人和你約定，要在某個夜晚一起看星星。可是，那個人的臉怎麼也看不清楚。這時，柳如煙剛好走進教室。",
        choices: [
            {
                text: "把筆記本拿給柳如煙看，問她認不認得這顆星星",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("noticed_star_drawing")) {
                        return "柳如煙看見那顆星星時，眼神明顯停住了。她沒有立刻回答，而是仔細看了看旁邊模糊的數字。「這個圖案……你真的不記得了嗎？」她問得很輕。你搖搖頭，她便把筆記本還給你。「沒事，也許只是以前隨手畫的。」但你注意到，她的手指不自覺地敲了幾下桌面。";
                    }
                    return "柳如煙看著那顆星星，表情短暫地停頓了一下。「好像在哪裡看過……」她低聲說完，又搖了搖頭。「可能是我記錯了。」她把筆記本還給你。你想繼續追問，她卻先一步轉移了話題，只留下那句沒說完的話在你心裡打轉。";
                },
                special: "showed_notebook",
                flag: "showed_star_notebook"
            },
            {
                text: "先把筆記本收好，問她今天的作業",
                affection: 1,
                trust: 1,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("accepted_invitation")) {
                        return "你把筆記本收好，問起今天的作業。柳如煙被你突然轉移話題的樣子逗笑了。「你也太實際了吧。」她拿出課本和你討論。聊到一半，她忽然看了看你的抽屜：「你是不是還留著很多以前的東西？」你還沒回答，上課鐘聲就響了。";
                    }
                    return "你把筆記本收好，問起今天的作業。柳如煙笑著拿出課本，開始和你討論題目。你暫時把那段模糊的記憶放到一旁，但下課時，你還是忍不住再次想起筆記本上的星星。";
                },
                special: "kept_notebook",
                flag: "kept_star_notebook"
            }
        ]
    },
    // ==============================
    // 第二章：照片裡的陌生人
    // 正式謎題線索暫時不在這一章收集
    // ==============================

    // 第 16 段：整理教室
    // 第 16 段（1/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "學校準備整理一批舊教材，老師請幾位同學留下來幫忙。你和柳如煙負責整理教室後方的櫃子。翻找資料時，你們看到幾本年代久遠的校刊。",
        choices: []
    },
    // 第 16 段（2/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙拿起其中一本，翻到一頁有著星空活動照片的地方，指尖停了片刻，隨後又把校刊闔上。",
        choices: []
    },
    // 第 16 段（3/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "你注意到，那一瞬間她的神情不像是在看陌生的資料，反而像是看見了某段不願輕易提起的回憶。",
        choices: [
            {
                text: "問她以前的校園生活是不是很有趣",
                affection: 2,
                trust: 1,
                expression: "happy",
                response: () => getStoryText(
                    "「應該吧。」柳如煙笑著說。「每個人的學生時代都有一些值得記住的事。」她把校刊放回櫃子，轉頭問你以前最喜歡哪一堂課。",
                    {
                        accepted_invitation: "柳如煙笑著靠近你。「昨天如果有一起出去，應該也會很有趣吧。」她拿起校刊，主動和你聊起以前的校園生活。聊到星空活動時，她卻忽然安靜下來，像是想起了某個人。",
                        declined_invitation: "柳如煙把校刊放回櫃子，禮貌地笑了笑。「以前的校園生活應該很有趣吧。」她沒有再提昨天的邀請，而是繼續整理手上的教材。不過，當你問起星空活動時，她還是忍不住多看了那本校刊一眼。"
                    }
                ),
                special: "asked_about_school_days",
                flag: "asked_about_school_days"
            },
            {
                text: "專心整理教材，等她自己決定要不要開口",
                affection: 0,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("showed_star_notebook")) {
                        return "你沒有追問，只是繼續把教材分類。柳如煙看了你幾次，最後主動把校刊遞到你面前。「你看看這張照片。」照片裡是一群參加星空活動的孩子，畫質模糊，人物也很難辨認。「不知道為什麼，我總覺得這張照片對我很重要。」她說完，卻沒有解釋原因。";
                    }
                    return "你繼續把教材分類。柳如煙也沒有再說什麼，只是偶爾把整理好的書本遞給你。過了一會兒，她忽然低聲說：「有些事情，不是忘記了就代表不重要。」她像是說給自己聽的，接著便繼續整理教材。";
                },
                special: "organized_materials",
                flag: "organized_materials"
            }
        ]
    },
    // 第 17 幕
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "normal",
        text: "放學後，教室裡的人逐漸散去。柳如煙還坐在位置上整理課本，窗外的夕陽落在她的筆記本上。你收拾好書包，正準備離開，她忽然抬起頭，像是有話想說，最後卻只是看著你。",
        choices: [
            {
                text: "主動問她要不要一起回家",
                affection: 3,
                trust: 2,
                expression: "happy",
                response: () => {
                    let opening = getStoryText(
                        "「要一起走嗎？」你問。柳如煙愣了一下，隨即收起筆記本。「好啊，剛好我也準備走了。」",
                        {
                            accepted_invitation: "你問她要不要一起回家。柳如煙很自然地站起身：「好啊，反正上次也聊得滿開心的。」",
                            declined_invitation: "你問她要不要一起回家。柳如煙稍微猶豫了一下，最後還是點頭：「可以啊。」你們之間仍留著一點尚未消散的尷尬。"
                        }
                    );

                    if (storyFlags.has("showed_star_notebook")) {
                        return opening + "走出校門後，柳如煙忽然問：「你那本舊筆記本，後來有再看過嗎？」她低頭走了幾步，又不自覺地用手指輕敲書包背帶。「我只是覺得，那顆星星好像在哪裡見過。」";
                    }

                    if (storyFlags.has("asked_about_school_days")) {
                        return opening + "路上，你們聊起以前的學校生活。談到星空活動時，柳如煙忽然放慢腳步。「如果有一天，你發現自己忘記了一個很重要的人，你會怎麼辦？」她問完後，像是後悔自己說得太突然，立刻補了一句：「我是說，如果只是普通朋友啦。」";
                    }

                    return opening + "回家的路上，你們聊著學校的瑣事。經過路口時，柳如煙停下來等紅燈，手指無意識地輕敲了幾下書包背帶。這個小動作讓你產生一種奇怪的熟悉感，卻一時想不起曾在哪裡看過。";
                },
                special: "walked_together",
                flag: "walked_together"
            },
            {
                text: "跟她打聲招呼就先離開",
                affection: 0,
                trust: 0,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("organized_materials")) {
                        return "你向柳如煙揮了揮手，背起書包離開教室。走到走廊轉角時，你回頭看了一眼，發現她正望著桌上的舊校刊。她的手指停在一張星空活動照片上，神情安靜得有些落寞。你沒有打擾她，但心裡開始在意那張照片究竟藏著什麼。";
                    }

                    if (storyFlags.has("showed_star_notebook")) {
                        return "你向柳如煙道別後離開教室。走到樓梯口時，你想起筆記本上的星星，以及她看見圖案時那一瞬間的停頓。也許她真的認得那個圖案，只是現在還不願意說出來。";
                    }

                    return "你向柳如煙揮了揮手，背起書包離開教室。她也向你道別，隨後低下頭繼續整理東西。走出校門後，你才發現自己還在想著她今天欲言又止的模樣。";
                },
                special: "left_after_school",
                flag: "left_after_school"
            }
        ]
    },
    // ==============================
    // 第 18 幕
    // ==============================
    // 第 18 段（1/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "隔天早上，教室裡比平常熱鬧。有人正在討論週末的安排，柳如煙則安靜地翻閱一本校園刊物。",
        choices: []
    },
    // 第 18 段（2/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "當你經過她的座位時，她抬頭看了你一眼，隨即把刊物稍微合起來，像是不確定該不該讓你看見裡面的內容。",
        choices: [
            {
                text: "問她正在看什麼，並仔細看看刊物",
                affection: 2,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("showed_star_notebook")) {
                        return "「這個嗎？」柳如煙把刊物轉向你。裡面記錄著以前的校園活動，其中一張照片拍的是夜間觀星活動。照片角落有一行模糊的日期，旁邊還畫著一顆小星星。你立刻想起舊筆記本上的圖案。柳如煙注意到你的反應，輕聲問：「你是不是在哪裡看過這個？」";
                    }

                    if (storyFlags.has("walked_together")) {
                        return "「是以前學校辦活動時留下來的紀錄。」柳如煙指著其中一張校園照片，和你聊起以前的活動。當翻到夜間觀星的照片時，她忽然停了下來。「有些回憶很奇怪，明明想不起全部，卻還是會記得當時的感覺。」她說完，便把那一頁留在桌上，沒有立刻翻過去。";
                    }

                    return "「是以前學校辦活動時留下來的紀錄。」柳如煙指著其中一張校園照片，和你聊起學校以前的活動。翻到夜間觀星的照片時，她多看了幾秒，才繼續往下翻。你問她是不是對這個活動特別有興趣，她只是笑著說：「可能吧，有些照片就是會讓人忍不住多看幾眼。」";
                },
                special: "discussed_school_history",
                flag: "discussed_school_history"
            },
            {
                text: "和同學聊別的事情，暫時不打擾她",
                affection: 0,
                trust: 0,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("left_after_school")) {
                        return "你轉身加入同學們的話題。柳如煙看了你一眼，沒有打擾你，繼續翻閱刊物。過了一會兒，她把其中一頁折了個小角，像是打算稍後再回來看。你沒有看清那頁的內容，只隱約瞥見照片裡有一片星空。";
                    }

                    return "你轉身加入同學們的話題。柳如煙沒有打擾你，繼續翻閱手中的刊物。你偶爾聽見她翻頁的聲音，心裡雖然有些好奇，最後還是決定先和同學聊天。";
                },
                special: "ignored_school_history",
                flag: "ignored_school_history"
            }
        ]
    },
    // ==============================
    // 第 19 幕
    // ==============================
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "午休時，柳如煙拿著一本筆記本來到你座位旁。她似乎想詢問你某件事，卻又停頓了一下，最後只是把筆記本放在桌上。她的手指輕輕敲了幾下封面，像是在猶豫該不該開口。",
        choices: [
            {
                text: "問她是不是有話想說",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("discussed_school_history")) {
                        return "「你怎麼知道？」柳如煙有些驚訝，接著笑了笑。「其實沒什麼，只是想問你，平常心情不好的時候都會做什麼？」你回答後，她低頭看著筆記本，輕聲說：「如果是忘記了一個很重要的人呢？明明知道那個人曾經存在，卻怎麼也想不起他的樣子……」她很快抬起頭。「抱歉，突然問了奇怪的問題。」你注意到她的筆記本裡夾著一張舊照片，但她沒有拿出來。";
                    }

                    return "「你怎麼知道？」柳如煙有些驚訝，接著笑了笑。「其實沒什麼，只是想問你，平常心情不好的時候都會做什麼？」你回答後，她安靜地聽著，偶爾點頭。最後，她像是終於下定決心，卻又把話收了回去，只說：「謝謝你願意回答我。」";
                },
                special: "asked_her_feelings",
                flag: "asked_her_feelings"
            },
            {
                text: "不急著追問，讓她按照自己的步調開口",
                affection: 0,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("waited_for_her") || storyFlags.has("organized_materials")) {
                        return "你沒有追問，只是繼續整理桌上的東西。過了一會兒，柳如煙像是放棄了原本的念頭，拿起筆記本準備回座位。就在她轉身前，她忽然停下來說：「如果有一天，你發現自己忘了很重要的事情，你會想辦法找回來嗎？」她沒有等你回答，只輕輕說了聲抱歉，便回到自己的位置。";
                    }

                    return "你沒有追問，只是繼續整理桌上的東西。過了一會兒，柳如煙拿起筆記本，輕聲說：「算了，等我想清楚再說吧。」她回到自己的位置後，偶爾會望向窗外，手指也不時輕敲桌面，似乎仍在思考那件讓她猶豫的事。";
                },
                special: "waited_for_her",
                flag: "waited_for_her"
            }
        ]
    },
    // ==============================
    // 第 20 幕
    // ==============================
    // 第 20 段（1/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "rainy_school",
        character: "柳如煙",
        expression: "normal",
        text: "放學前，天空忽然暗了下來。窗外傳來細碎的雨聲，同學們紛紛拿出雨傘。柳如煙停下手邊的動作，望向窗外，似乎比平常多看了一會兒。",
        choices: []
    },
    // 第 20 段（2/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "rainy_school",
        character: "柳如煙",
        expression: "normal",
        text: "雨滴沿著玻璃滑落，她的指尖也跟著輕輕敲了幾下桌面，像是在配合某段只有她自己聽得見的節奏。",
        choices: [
            {
                text: "問她喜不喜歡下雨天",
                affection: 2,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("asked_her_feelings")) {
                        return "「下雨天嗎？」柳如煙望著窗外，輕輕笑了笑。「我其實滿喜歡雨聲的，尤其是安靜的時候。」她停了一會兒，又低聲說：「以前好像也有一個人跟我一樣，會特地停下來聽雨。」說完，她像是察覺自己說得太多，立刻拿起書包。「走吧，再晚雨可能會更大。」";
                    }

                    if (storyFlags.has("walked_together")) {
                        return "「下雨天嗎？」柳如煙望著窗外，輕輕笑了笑。「我其實滿喜歡雨聲的，尤其是安靜的時候。」她看了你一眼，又補充：「以前有人跟我說，聽雨的時候，腦袋裡那些亂七八糟的事情好像就會慢慢安靜下來。」她沒有說出那個人的名字，便拿起書包準備離開。";
                    }

                    return "「下雨天嗎？」柳如煙望著窗外，輕輕笑了笑。「我其實滿喜歡雨聲的，尤其是安靜的時候。」她說完便拿起書包，像是覺得這只是個再普通不過的話題。只是走到門口時，她又停了一下，回頭看了看窗外的雨。";
                },
                special: "talked_about_rain",
                flag: "talked_about_rain"
            },
            {
                text: "提醒她別忘記帶傘，順便問她怎麼回家",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("showed_star_notebook")) {
                        return "你提醒柳如煙帶傘，她低頭看了看書包，這才發現自己忘了準備。「還好你有提醒我，謝謝。」她望著窗外的雨，忽然問：「你以前有沒有和誰約好，下雨天也要一起做某件事？」你還沒回答，她便搖了搖頭。「算了，我只是突然想到一件很久以前的事。」";
                    }

                    return "你提醒柳如煙帶傘。她低頭看了看自己的書包，這才發現忘了準備。「還好你有提醒我，謝謝。」她開始思考該怎麼回家。你提議她可以先等雨小一點，她想了想，點頭說：「也好，我其實不討厭下雨。雨聲聽久了，反而會讓人覺得很安心。」";
                },
                special: "reminded_her_umbrella",
                flag: "reminded_her_umbrella"
            }
        ]
    },
    // ==============================
    // 第 21 幕
    // ==============================
    // 第 21 段（1/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "rainy_school",
        character: "柳如煙",
        expression: "normal",
        text: "雨勢逐漸變小。你和柳如煙在校門附近遇見，她正站在屋簷下看著遠處的天空。聽見你的腳步聲，她轉過頭，神情恢復了平常的模樣。",
        choices: []
    },
    // 第 21 段（2/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "rainy_school",
        character: "柳如煙",
        expression: "normal",
        text: "地面還留著雨水，路旁的樹葉被洗得發亮，空氣裡帶著一股潮濕的氣味。",
        choices: [
            {
                text: "邀請她一起走到車站",
                affection: 3,
                trust: 2,
                expression: "happy",
                response: () => {
                    let opening = getStoryText(
                        "「一起走吧。」你說。柳如煙點點頭，與你並肩走出校門。一路上，你們聊著學校的事情，偶爾停下來看一眼路旁被雨水洗亮的樹葉。",
                        {
                            walked_together: "「又遇到了啊。」柳如煙笑著走到你身旁。你們一邊走，一邊接續昨天沒聊完的話題。",
                            left_after_school: "柳如煙看見你後，禮貌地向你打招呼。聽見你的邀請，她猶豫了一下，才拿起雨傘跟上你的腳步。"
                        }
                    );

                    if (storyFlags.has("talked_about_rain")) {
                        return opening + "走到一半，柳如煙忽然放慢腳步，聽著屋簷滴落的雨水。「奇怪，這種聲音總讓我想起小時候。」她低頭笑了笑。「以前好像有人答應過我，長大以後還要一起去看星星。只是……我已經記不清那個人的樣子了。」她沒有看你，像是怕你追問似的，接著往前走。";
                    }

                    if (storyFlags.has("showed_star_notebook")) {
                        return opening + "經過一間文具店時，柳如煙忽然問：「你那本舊筆記本，還有繼續找裡面的東西嗎？」她停頓片刻，又說：「有時候，一張照片或一個小圖案，可能比我們記得的還重要。」說完，她便安靜地看著前方。";
                    }

                    return opening + "走到車站附近時，柳如煙忽然問你：「你相信小時候的約定，長大以後還算數嗎？」她看著路面上的水窪，沒有立刻解釋，只補了一句：「如果其中一個人忘記了呢？」";
                },
                special: "walked_to_station",
                flag: "walked_to_station"
            },
            {
                text: "向她道別，自己先回家",
                affection: 0,
                trust: 0,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("discussed_school_history")) {
                        return "你向柳如煙道別，獨自走進雨後的街道。她站在屋簷下向你揮手，直到你走遠，才轉身離開。回家後，你想起校刊裡那張星空活動照片，忽然覺得她今天的神情，和看見照片時一模一樣。";
                    }

                    if (storyFlags.has("talked_about_rain")) {
                        return "你向柳如煙道別，獨自走進雨後的街道。她站在屋簷下向你揮手，直到你走遠，才轉身離開。雨聲漸漸遠去，你卻莫名想起她說過自己喜歡聽雨，心裡浮現一種似曾相識的感覺。";
                    }

                    return "你向柳如煙道別，獨自走進雨後的街道。她站在屋簷下向你揮手，直到你走遠，才轉身離開。走了一段路，你回頭看向學校，想起她最近幾次欲言又止的模樣，覺得她似乎一直藏著某個重要的秘密。";
                },
                special: "went_home_alone",
                flag: "went_home_alone"
            }
        ]
    },
        // ==============================
    // 第 22 幕：借來的筆記
    // ==============================
    // 第 22 段（1/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "隔天上課前，柳如煙拿著課本走到你桌邊。「昨天老師說的那個地方，我好像還是不太懂。」她把筆記本放在桌上，指著其中一段。",
        choices: []
    },
    // 第 22 段（2/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "「你可以跟我說一下嗎？」你注意到她的筆記本裡夾著一張折起來的紙，邊緣已經泛黃。她似乎很在意那張紙，卻沒有主動提起。",
        choices: [
            {
                text: "耐心幫她整理重點，順便問她那張泛黃的紙",
                affection: 3,
                trust: 3,
                expression: "happy",
                response: () => {
                    let result = "你把課本移到兩人中間，重新整理了一遍解題步驟。柳如煙認真聽著，偶爾低頭做筆記。「原來是這樣，謝謝你。」";

                    if (storyFlags.has("asked_her_feelings")) {
                        return result + "她合上筆記本時，你問起那張泛黃的紙。柳如煙的手停了一下，最後小心地把紙抽出來，卻沒有完全展開。「這是很久以前留下來的東西。」她輕聲說。「我一直想弄清楚上面寫的話，還有那個人到底去了哪裡。」她沒有把紙交給你，但第一次主動承認，自己正在尋找某個人。";
                    }

                    if (storyFlags.has("showed_star_notebook")) {
                        return result + "你問起那張泛黃的紙，柳如煙猶豫了一會兒。「跟你筆記本上的星星，可能有一點關係。」她沒有多解釋，只把紙重新夾好。「等我確定一些事情，再告訴你，好嗎？」";
                    }

                    return result + "你注意到那張泛黃的紙，便順口問了一句。柳如煙把筆記本往自己這邊挪了挪，微笑著說：「只是以前留下來的東西。」她沒有繼續說明，但你感覺那張紙對她而言並不普通。";
                },
                special: "helped_her_study",
                flag: "helped_her_study"
            },
            {
                text: "請她先問老師，尊重她自己找答案的方式",
                affection: 0,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("talked_about_rain")) {
                        return "你告訴她可以先問老師，會比較清楚。柳如煙點點頭：「也對，那我下課再去問。」她把課本收好，卻在離開前望向窗外的天空。「有些問題，果然還是得自己慢慢找答案。」她說完便回到座位。";
                    }

                    return "你告訴她可以先問老師，會比較清楚。柳如煙點點頭：「也對，那我下課再去問。」她把課本收好，沒有勉強你留下來幫忙。整理東西時，那張泛黃的紙從筆記本裡露出一角，她很快便將它收好。";
                },
                special: "asked_her_teacher",
                flag: "asked_her_teacher"
            }
        ]
    },
    // ==============================
    // 第 23 幕：奇怪的小習慣
    // ==============================
    // 第 23 段（1/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "午休時，你和柳如煙坐在教室裡聊天。她一邊思考，一邊用手指輕輕敲著桌面，節奏不快，卻像是有固定的規律。",
        choices: []
    },
    // 第 23 段（2/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "過了一會兒，她似乎察覺到你的視線，便停下動作。",
        choices: []
    },
    // 第 23 段（3/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "奇怪的是，你看著她的手指，腦海裡竟閃過一個模糊的畫面：小時候，好像也有一個人總在想事情時做出相同的動作。",
        choices: [
            {
                text: "笑著問她在敲什麼節奏",
                affection: 2,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (
                        storyFlags.has("walked_to_station") ||
                        storyFlags.has("walked_together")
                    ) {
                        return "柳如煙低頭看了看自己的手指。「有嗎？我想事情的時候好像常常這樣。」她有些不好意思地笑了笑。你告訴她，自己似乎在哪裡看過相同的動作，她的笑容慢慢停住。「是嗎……」她沉默了一會兒，才輕聲說：「以前好像也有人這樣。」她沒有繼續說下去，但你們都沒有立刻轉移話題。";
                    }

                    if (storyFlags.has("showed_star_notebook")) {
                        return "柳如煙低頭看了看自己的手指。「有嗎？我想事情的時候好像常常這樣。」她有些不好意思地笑了笑。你提起舊筆記本上的星星，問她會不會也有一些自己沒察覺、卻一直保留下來的習慣。她看著你，緩緩點頭：「也許吧。有些事情，就算忘了原因，還是會一直做下去。」";
                    }

                    return "柳如煙低頭看了看自己的手指。「有嗎？我想事情的時候好像常常這樣。」她有些不好意思地笑了笑，又把手收回桌下。「連我自己都沒注意到。」你沒有再追問，但那個熟悉的節奏，卻留在了你的記憶裡。";
                },
                special: "noticed_finger_tapping",
                flag: "noticed_finger_tapping"
            },
            {
                text: "當作沒看見，繼續聊班上的趣事",
                affection: 1,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("asked_about_school_days")) {
                        return "你沒有特別提起她的小動作，繼續聊著班上的趣事。柳如煙很快投入話題，手指不知不覺又輕輕敲了幾下桌面。你忽然想起她之前說過，每個人的學生時代都有值得記住的事。也許這個習慣，就是她某段回憶留下的痕跡。";
                    }

                    return "你沒有特別提起她的小動作，繼續聊著班上的趣事。柳如煙也很快投入話題，手指不知不覺又輕輕敲了幾下桌面。你沒有打斷她，只是默默記住了這個細節。";
                },
                special: "overlooked_finger_tapping",
                flag: "overlooked_finger_tapping"
            }
        ]
    },
    // ==============================
    // 第 24 幕：社團活動
    // ==============================
    // 第 24 段（1/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "班上開始討論下週的社團成果展示。柳如煙拿著活動表走到你面前。「你會去看嗎？聽說今年有不少有趣的作品。」她說得自然，卻像是在等你的回答。",
        choices: []
    },
    // 第 24 段（2/2 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "活動表上除了各社團的展示時間，還有一個特別的項目：舊校園照片展。她的目光在那幾個字上停留片刻，才重新看向你。",
        choices: [
            {
                text: "答應和她一起去看，順便問問舊照片展",
                affection: 3,
                trust: 2,
                expression: "happy",
                response: () => {
                    let result = getStoryText(
                        "「好啊，到時候一起去。」你答應後，柳如煙露出了開心的笑容。「那就說好了，不可以忘記喔。」",
                        {
                            accepted_invitation: "「好啊。」你答應後，柳如煙笑著說：「那到時候一起去，應該會滿有趣的。」",
                            declined_invitation: "柳如煙聽見你的答應，似乎稍微放下心來。「那就說好了。」她沒有多說，只把活動日期指給你看。"
                        }
                    );

                    if (storyFlags.has("noticed_finger_tapping")) {
                        return result + "你注意到她說「不可以忘記」時，手指又輕輕敲了幾下活動表。你問她是不是很期待舊照片展，她的笑容稍微收斂。「嗯……我想確認一件很久以前的事。」她沒有說明是什麼，只把活動表交給你看。";
                    }

                    if (storyFlags.has("showed_star_notebook")) {
                        return result + "你指著舊照片展的項目，提起筆記本上的星星。柳如煙的神情認真起來。「也許那裡真的有你想不起來的東西。」她停頓片刻，又補充：「到時候，我們一起找找看。」";
                    }

                    return result + "你問她為什麼特別注意舊照片展，她只是笑了笑。「有些以前的事情，偶爾也會想重新看看。」她把這句話說得很輕，隨後便和你討論起展示當天的時間。";
                },
                special: "accepted_club_invitation",
                flag: "accepted_club_invitation"
            },
            {
                text: "表示還不確定有沒有空，先不答應",
                affection: 0,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("talked_about_rain")) {
                        return "你告訴她自己還不確定時間。柳如煙點點頭：「沒關係，你確定之後再說。」她把活動表收回去，卻在轉身前提醒你：「舊照片展只有那幾天，想看的話別錯過了。」她說得平靜，但似乎很希望你能去。";
                    }

                    return "你告訴她自己還不確定時間。柳如煙點點頭：「沒關係，你確定之後再說。」她把活動表收回去，沒有繼續追問。你無意間看見她在活動日期旁畫了一顆小星星，和你在舊筆記本裡看過的圖案有些相似。";
                },
                special: "uncertain_about_club",
                flag: "uncertain_about_club"
            }
        ]
    },
    // ==============================
    // 第 25 幕：舊校刊
    // ==============================
    // 第 25 段（1/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "圖書館裡，你們翻閱著歷年的校刊，尋找社團成果展示的資料。某一頁記錄著多年前的校園活動，照片中的學生笑得燦爛，背景裡還能看見熟悉的校舍。",
        choices: []
    },
    // 第 25 段（2/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "翻到星空活動的紀錄時，你發現照片角落有兩個孩子站在老樹下，其中一人的手裡拿著一張紙。照片下方的日期已經模糊，只剩下部分數字。",
        choices: []
    },
    // 第 25 段（3/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙看著照片，久久沒有翻頁。",
        choices: [
            {
                text: "仔細閱讀活動紀錄，詢問柳如煙認不認得照片裡的人",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    collectClue("old_photo");

                    if (storyFlags.has("showed_star_notebook")) {
                        return "你仔細閱讀活動紀錄，發現這場星空活動舉辦於多年前，照片角落還有一個熟悉的星星圖案。你把舊筆記本拿出來比對，兩個圖案幾乎一模一樣。柳如煙看見後，手指微微顫了一下。「這張照片……我好像一直在找。」她終於承認，自己想找回一段遺失的回憶。你們把照片的頁碼記下，決定之後再查清楚日期。";
                    }

                    if (storyFlags.has("noticed_finger_tapping")) {
                        return "你們一起讀著活動紀錄。柳如煙忽然停在那張照片前，指著其中一個孩子說：「你不覺得這個動作有點眼熟嗎？」照片裡的孩子正用手指輕敲身旁的欄杆。你想起她思考時也會做出相同的動作，卻無法只憑這一點判斷兩者是否有關。你把照片頁碼和模糊的日期記了下來。";
                    }

                    return "你們一起讀著校刊裡的活動紀錄。柳如煙忽然停在其中一頁，視線在那張校園照片上多停留了幾秒。「以前的校園，好像跟現在有點不一樣。」她輕聲說。你發現照片中的兩個孩子似乎在老樹下約定著什麼，但文字說明沒有寫清楚。你記下頁碼，打算有機會再回來查證。";
                },
                special: "read_old_yearbook",
                flag: "read_old_yearbook",
                clue: "old_photo"
            },
            {
                text: "先找今年的活動資訊，記下資料後再決定是否回頭調查",
                affection: 1,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("accepted_club_invitation")) {
                        return "你很快找到今年的活動資訊，柳如煙也湊過來確認日期。整理完資料後，她卻沒有馬上離開，而是望向那本舊校刊。「等一下……那張星空活動的照片，我們是不是還沒看清楚？」她問。你們最後決定先記下頁碼，等有時間再回來調查。";
                    }

                    return "你很快找到今年的活動資訊，柳如煙也湊過來確認日期。你們把需要的資料記下後，便準備離開圖書館。走到門口時，你回頭看見那本舊校刊仍攤在星空活動的頁面，照片裡模糊的日期讓你有些在意。";
                },
                special: "searched_current_event",
                flag: "searched_current_event"
            }
        ]
    },
    // ==============================
    // 第 26 幕：沒說出口的話
    // ==============================
    // 第 26 段（1/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "柳如煙",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "離開圖書館時，柳如煙忽然叫住你。「欸，我有件事想問你……」她說到一半又停了下來，低頭看著手中的校刊。",
        choices: []
    },
    // 第 26 段（2/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "柳如煙",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "那張星空活動的照片仍留在她的腦海裡，照片中的兩個孩子，以及那個模糊的日期，似乎都和她遺失的記憶有關。她握緊校刊，最後只是搖搖頭。",
        choices: []
    },
    // 第 26 段（3/3 幕）
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "柳如煙",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "「算了，等我想清楚再說吧。」",
        choices: [
            {
                text: "告訴她，你願意聽她說",
                affection: 3,
                trust: 3,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("asked_her_feelings")) {
                        return "「如果你想說的話，我會聽。」你輕聲回答。柳如煙抬起頭，原本猶豫的表情稍微放鬆了一些。「其實，我一直在找一個人。」她停頓片刻，像是在斟酌用詞。「我記得小時候和他約好，長大以後要再見面，一起看星星。可是，我已經忘記他的長相了。」她望著你，眼神裡帶著期待，也帶著害怕失望的猶豫。「我不知道自己還能不能找到他。」";
                    }

                    return "「如果你想說的話，我會聽。」你輕聲回答。柳如煙抬起頭，原本猶豫的表情稍微放鬆了一些。「嗯……謝謝你。等我整理好思緒，再告訴你。」她將校刊抱在胸前，像是終於決定不再獨自承受這件事。";
                },
                special: "offered_to_listen",
                flag: "offered_to_listen"
            },
            {
                text: "不勉強她，讓她自己決定什麼時候開口",
                affection: 2,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("noticed_finger_tapping")) {
                        return "你告訴她不用急著回答，等她準備好了再說就好。柳如煙看著你，輕輕點頭。「好，我知道了。」她把校刊抱在胸前，手指不自覺地敲了幾下封面。「謝謝你沒有一直追問我。」你看著那個熟悉的小動作，心中那段模糊的記憶又浮現了一瞬。";
                    }

                    return "你告訴她不用急著回答，等她準備好了再說就好。柳如煙看著你，輕輕點頭。「好，我知道了。」她把校刊抱在胸前，和你一起走出圖書館。走到門口時，她回頭看了一眼書架，低聲說：「有些答案，我真的很想找回來。」";
                },
                special: "gave_her_time",
                flag: "gave_her_time"
            }
        ]
    },
    // ==============================
    // 第 27 幕：模糊的夢
    // ==============================
    // 第 27 段（1/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "bedroom",
        character: "柳如煙",
        expression: "normal",
        text: "那天晚上，你躺在床上，腦海裡不斷浮現柳如煙在圖書館裡的表情。她說自己正在尋找一個人，而那個人曾經和她約好，長大後要一起看星星。",
        choices: []
    },
    // 第 27 段（2/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "bedroom",
        character: "柳如煙",
        expression: "normal",
        text: "不知道為什麼，聽見這件事時，你的心裡竟然產生一種說不出的熟悉感。你閉上眼睛，意識逐漸模糊。",
        choices: []
    },
    // 第 27 段（3/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "dream_campus",
        character: "柳如煙",
        expression: "normal",
        text: "夢裡，你回到一座陌生又熟悉的校園。一棵高大的老樹下，有個看不清臉的女孩正站在那裡。她似乎等了很久，終於抬起頭問：「你真的會再來嗎？」",
        choices: [
            {
                text: "走向女孩，答應一定會再回來",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("offered_to_listen")) {
                        return "你走向女孩，認真地回答：「我答應你，一定會再回來。」女孩終於露出笑容，從口袋裡拿出一張折好的紙。「那你要記得喔，我們說好了。」你伸手想接過那張紙，畫面卻突然變得模糊。醒來時，你發現自己已經滿頭大汗。那句「我們說好了」，仍清楚地留在你的腦海裡。你第一次懷疑，柳如煙尋找的那個人，會不會和自己有關。";
                    }

                    return "你走向女孩，認真地回答：「我答應你，一定會再回來。」女孩似乎鬆了一口氣，輕輕點頭。「那就說好了。」她把一張折好的紙放進你的手裡。你還沒來得及看清上面的內容，夢境便突然中斷。醒來後，你只記得女孩的聲音，以及自己曾經做過某個重要承諾的感覺。";
                },
                special: "promised_in_dream",
                flag: "promised_in_dream"
            },
            {
                text: "先問女孩的名字，想確認她究竟是誰",
                affection: 0,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("noticed_finger_tapping")) {
                        return "你沒有立刻答應，而是問她：「妳叫什麼名字？」女孩低下頭，手指不自覺地敲了幾下手中的紙。「你以前明明知道的。」她的聲音聽起來有些失落。你想靠近看清她的臉，卻發現無論怎麼努力，都只能看見一片模糊的光。醒來後，你久久無法平靜。那個敲手指的習慣，竟然讓你想起柳如煙。";
                    }

                    return "你沒有立刻答應，而是問她：「妳叫什麼名字？」女孩沉默了一會兒，輕聲回答：「如果你真的忘記了，那我就等你想起來。」你想看清她的臉，眼前的景象卻逐漸消失。醒來後，你只記得那句話，還有胸口那股難以解釋的失落感。";
                },
                special: "asked_dream_girl_name",
                flag: "asked_dream_girl_name"
            }
        ]
    },
    // ==============================
    // 第 28 幕：似曾相識的動作
    // ==============================
    // 第 28 段（1/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "隔天早上，你帶著昨晚的夢境走進教室。柳如煙已經坐在位置上，正低頭整理筆記。聽見你的腳步聲，她抬起頭，像往常一樣向你打招呼。",
        choices: []
    },
    // 第 28 段（2/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "你原本想把夢裡的事情告訴她，卻在看見她手上的動作時愣住了。她一邊思考，一邊用手指輕敲桌面，節奏和夢裡那個女孩敲擊紙張的聲音幾乎一樣。",
        choices: []
    },
    // 第 28 段（3/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "察覺到你的視線後，她停下動作，疑惑地問：「怎麼了？我臉上有東西嗎？」",
        choices: [
            {
                text: "告訴她昨晚夢見一個站在老樹下的女孩",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("promised_in_dream")) {
                        return "「我夢見一個女孩，她站在老樹下，好像一直在等我。」你說完後，柳如煙的笑容慢慢消失。「老樹……她有說什麼嗎？」她問得很輕。你想起夢裡那句「我們說好了」，便把這件事也告訴她。柳如煙的手指停在半空，過了好一會兒才收回去。「可能只是巧合吧。」她低下頭，卻不再翻動手中的筆記。";
                    }

                    return "「我昨天做了一個奇怪的夢。」你告訴她，自己夢見一個看不清臉的女孩站在老樹下。柳如煙原本輕鬆的神情稍微變了。「老樹？」她重複了一次，接著笑著搖頭。「可能是最近太累了吧，才會做這種夢。」她雖然這麼說，卻沒有立刻繼續整理筆記。";
                },
                special: "shared_dream",
                flag: "shared_dream"
            },
            {
                text: "先不提夢境，問她今天為什麼一直敲桌面",
                affection: 2,
                trust: 2,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("noticed_finger_tapping")) {
                        return "你問她是不是在思考什麼事情。柳如煙低頭看了看自己的手指，有些不好意思地笑了。「我也不知道，想事情的時候就會這樣。」你告訴她，自己以前似乎也認識一個有相同習慣的人。她的笑容停頓了一瞬。「是嗎？那個人對你很重要嗎？」她看著你，像是很在意這個問題的答案。";
                    }

                    return "你問她是不是在思考什麼事情。柳如煙低頭看了看自己的手指，笑著說：「可能是習慣吧，我自己都沒注意到。」她把手收回桌下，接著問你昨晚有沒有睡好。你沒有說出夢境的事，但心裡已經把這個小動作記了下來。";
                },
                special: "asked_about_tapping",
                flag: "asked_about_tapping"
            }
        ]
    },
    // ==============================
    // 第 29 幕：記憶中的雨聲
    // ==============================
    // 第 29 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "午休時，窗外忽然下起細雨。教室裡的同學大多出去買午餐，只剩下零星幾個人留在座位上。",
        choices: []
    },
    // 第 29 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙望著窗外，手指輕輕敲著桌面，像是在聽某種只有她熟悉的節奏。",
        choices: []
    },
    // 第 29 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "過了一會兒，她忽然開口：「你有沒有過這種感覺？明明已經忘記一件事情很久了，可是某一天，只要聽見一個聲音，就會突然覺得自己好像曾經經歷過什麼。」",
        choices: []
    },
    // 第 29 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "她轉過頭看著你。「你相信記憶會自己回來嗎？」",
        choices: [
            {
                text: "相信記憶會慢慢回來，重要的事不會完全消失",
                affection: 2,
                trust: 3,
                expression: "happy",
                response: () => {
                    if (storyFlags.has("shared_dream")) {
                        return "「我也希望是這樣。」柳如煙望向窗外，輕聲說：「有時候，我會夢見一個人在雨裡等我。可是每次想看清他的臉，夢就醒了。」她停了一會兒，又問：「如果有一天，你發現自己忘記了一個很重要的人，你會努力想起他嗎？」她沒有等你回答，只低頭看著自己的手指。「我想，我會的。」";
                    }

                    if (storyFlags.has("promised_in_dream")) {
                        return "柳如煙聽完後，露出一個有些寂寞的笑容。「那就好。」她望著窗外，低聲說：「我一直覺得，自己忘記了一個很重要的約定。雖然想不起全部，但我不想就這樣算了。」雨聲漸漸變大，她的手指也停了下來，像是終於下定某種決心。";
                    }

                    return "柳如煙輕輕點頭。「我也希望是這樣。」她望著窗外，慢慢說起自己小時候的一些事情。她記得曾經有個人陪她聽雨，也記得兩人好像約好過什麼，只是約定的內容已經模糊不清。「有時候我真的很怕，等我想起來的時候，那個人已經不在原地了。」";
                },
                special: "believed_memory_returns",
                flag: "believed_memory_returns"
            },
            {
                text: "認為記憶不一定會回來，與其猜測不如面對現在",
                affection: 0,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("asked_dream_girl_name")) {
                        return "「面對現在嗎……」柳如煙低聲重複你的話，沉默了片刻。「或許你說得也有道理。」她看著窗外，接著問：「可是，如果現在的某個人，和你忘記的人有關呢？你會不會想知道真相？」她沒有再追問，只把桌上的筆記本慢慢闔上。";
                    }

                    return "柳如煙沒有立刻反駁，只是輕輕點頭。「也許吧，畢竟一直想著過去，確實很累。」她停頓了一下，又說：「可是有些事情，如果不知道答案，真的能放心放下嗎？」她沒有要求你回答，只是繼續聽著窗外的雨聲。";
                },
                special: "focused_on_present",
                flag: "focused_on_present"
            }
        ]
    },
    // ==============================
    // 第 30 幕：不該忘記的約定
    // ==============================
    // 第 30 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "下午放學前，老師臨時宣布隔天要交一份小組報告。你和幾名同學留下來討論分工，柳如煙也在其中。",
        choices: []
    },
    // 第 30 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "討論到一半，有人抱怨事情太多，笑著說：「反正只是隨便答應的事，忘了也沒差吧。」你順口回了一句：「既然答應了，就應該努力做到啊。」",
        choices: []
    },
    // 第 30 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "話才剛說完，柳如煙手中的筆便掉到了地上。她彎腰撿起筆，卻沒有立刻站起來。",
        choices: []
    },
    // 第 30 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "等其他同學離開後，她才低聲問你：「你一直都是這樣的人嗎？就算已經忘記當初為什麼答應，也會努力做到？」",
        choices: [
            {
                text: "認真回答，答應別人的事就不該輕易忘記",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("believed_memory_returns")) {
                        return "「至少我會努力記得。」你回答。柳如煙低著頭，沉默了好一會兒。「那如果對方一直在等你呢？」她的聲音有些發顫。「如果你早就忘記了，只有她還記得，你會怎麼辦？」你正想追問，她卻忽然抬起頭，勉強笑了笑。「抱歉，我今天有點奇怪。」她拿起書包，離開前只留下了一句話：「希望你真的能做到。」";
                    }

                    return "「我覺得，答應了就應該盡力做到。」你回答。柳如煙望著你，眼神有些複雜。「就算不知道自己為什麼答應的？」她輕聲問。你點頭後，她沒有再說什麼，只是把筆收進筆袋。走出教室前，她回頭看了你一眼，像是想確認你是不是認真的。";
                },
                special: "honored_promises",
                flag: "honored_promises"
            },
            {
                text: "坦白承認，人會忘記事情，但可以重新做出選擇",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("focused_on_present")) {
                        return "「人會忘記，但不代表現在不能重新選擇。」你回答。柳如煙聽完後，神情反而慢慢平靜下來。「重新選擇嗎……」她望向窗外，像是在思考這句話。「如果那個人已經不是當初的樣子了，重新開始還有意義嗎？」她沒有等你回答，便收拾好東西。「謝謝你，我想我知道該怎麼做了。」但她的表情，顯然還沒有真正放下。";
                    }

                    return "「人確實會忘記很多事，但我們還是可以決定現在要怎麼做。」你回答。柳如煙安靜地聽著，過了一會兒才說：「所以，就算忘記了，也還有重新開始的機會嗎？」她像是在問你，又像是在問自己。最後，她輕輕點頭，沒有再追問。";
                },
                special: "accepted_change",
                flag: "accepted_change"
            }
        ]
    },
    // ==============================
    // 第 31 幕：沒有寄出的信
    // ==============================
    // 第 31 段（1/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "隔天放學，你到圖書館歸還參考書，卻意外看見柳如煙坐在靠窗的位置。她面前攤著幾本舊校刊和一本泛黃的筆記本，桌上還放著一張寫滿字的便條紙。",
        choices: []
    },
    // 第 31 段（2/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "她似乎正在比對不同年份的校園活動紀錄，眉頭越皺越緊。你走近時，她立刻把便條紙翻了過去。「你怎麼在這裡？」",
        choices: []
    },
    // 第 31 段（3/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "library",
        character: "柳如煙",
        expression: "normal",
        text: "她問得有些突然，隨後才發現自己的語氣不太自然。「我只是想查一些以前的資料。」",
        choices: [
            {
                text: "坦白告訴她自己看見了便條紙，問她需要幫忙嗎",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("honored_promises")) {
                        return "你沒有假裝沒看見，而是坦白說自己注意到了那張便條紙，問她是否需要幫忙。柳如煙猶豫了一會兒，終於把便條紙翻回正面。上面只有幾個零散的字：「老樹、星空、那封信……」她低聲說：「我記得小時候好像寫過一封信，但我一直找不到它。」她抬頭看著你。「我不知道那封信是不是還在，也不知道裡面到底寫了什麼。只是，我總覺得它很重要。」";
                    }

                    return "你告訴她自己看見了便條紙，問她需不需要幫忙。柳如煙先是有些尷尬，接著才放鬆下來。「其實，我在找一件以前留下來的東西。」她把便條紙收進筆記本，沒有透露更多細節。「等我找到之後，如果真的有答案，我再告訴你。」";
                },
                special: "offered_letter_search_help",
                flag: "offered_letter_search_help"
            },
            {
                text: "不追問她的私人事情，改問她查資料查得如何",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("accepted_change")) {
                        return "你沒有追問，只問她查資料的進度。柳如煙似乎鬆了一口氣，重新翻開筆記本。「還差一點。」她說。「有些事情明明留下了紀錄，卻偏偏缺少最重要的部分。」她望著窗外，忽然補了一句：「如果當初有把那封信交出去，現在是不是就不一樣了？」話一出口，她便立刻停住，像是沒想到自己會說出這句話。";
                    }

                    return "你沒有追問她的私人事情，只問她查得如何。柳如煙搖搖頭。「還沒有找到想要的東西。」她把筆記本合上，語氣有些無奈。「有時候，越想找回一件事，就越發現自己忘了很多細節。」你沒有繼續追問，但記住了她剛才提到的那封信。";
                },
                special: "respected_her_privacy",
                flag: "respected_her_privacy"
            }
        ]
    },
    // ==============================
    // 第 32 幕：被遺忘的地方
    // ==============================
    // 第 32 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_community_center",
        character: "柳如煙",
        expression: "normal",
        text: "週末午後，柳如煙傳訊息問你有沒有空，說想帶你去一個地方。你們搭車來到城市邊緣的一處老社區。",
        choices: []
    },
    // 第 32 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_community_center",
        character: "柳如煙",
        expression: "normal",
        text: "這裡的店面大多已經關閉，牆上的招牌褪了色，只有幾個老人坐在騎樓下聊天。走過一條狹窄的巷子後，你們停在一棟老舊的社區活動中心前。",
        choices: []
    },
    // 第 32 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_community_center",
        character: "柳如煙",
        expression: "normal",
        text: "門口的公告寫著，這裡即將拆除。柳如煙站在門前，遲遲沒有推門。「我不知道自己為什麼還記得這裡。」她低聲說。",
        choices: []
    },
    // 第 32 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_community_center",
        character: "柳如煙",
        expression: "normal",
        text: "「可是每次想起小時候，我總覺得自己曾經在這裡等過某個人。」",
        choices: [
            {
                text: "陪她走進去，一起找找有沒有熟悉的東西",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("promised_in_dream")) {
                        return "你陪柳如煙推開大門。屋內瀰漫著灰塵與舊木頭的氣味，牆上還留著褪色的活動海報。走到最裡面的房間時，你忽然看見一面畫著星星的舊牆。某個模糊的畫面瞬間閃過腦海：一個小女孩坐在地板上，手裡拿著紙，正認真地畫著星星。你不自覺地伸出手，柳如煙也同時碰上那面牆。兩人愣了一下。她望著你，聲音微微發顫：「你是不是……也覺得這裡很熟悉？」";
                    }

                    return "你陪柳如煙走進活動中心。裡面堆著一些準備清走的桌椅，牆上還貼著幾張褪色的活動海報。柳如煙慢慢走過每個房間，卻始終沒有找到想要的東西。直到你們來到最裡面的房間，她忽然停下腳步，望著牆上一道淡淡的星星塗鴉。「我好像……真的來過這裡。」她輕聲說，卻想不起更多細節。";
                },
                special: "entered_old_center",
                flag: "entered_old_center"
            },
            {
                text: "先問她為什麼想來這裡，再決定要不要進去",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("offered_letter_search_help")) {
                        return "你問柳如煙，這裡是不是和她正在尋找的東西有關。她沉默片刻，終於坦白：「我記得自己小時候曾經把一樣東西藏在這附近，可是我忘了藏在哪裡。」她看向活動中心的門。「我本來想自己來找，但不知道為什麼，最後還是傳訊息給你了。」她沒有解釋原因，只問你願不願意陪她進去。";
                    }

                    return "你問她為什麼想來這裡。柳如煙低頭思考了一會兒。「我也說不上來。只是最近一直夢見一個地方，而夢裡的景象跟這裡很像。」她看著那扇老舊的門，猶豫地說：「如果裡面真的沒有任何線索，我大概就會放棄了吧。」但她的語氣聽起來，並不像真的想放棄。";
                },
                special: "questioned_old_center",
                flag: "questioned_old_center"
            }
        ]
    },
    // ==============================
    // 第 33 幕：記得那一天的人
    // ==============================
    // 第 33 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_room",
        character: "柳如煙",
        expression: "normal",
        text: "你們在活動中心裡找了一會兒，卻沒有發現明顯的線索。正準備離開時，一名拿著紙箱的老先生從走廊另一頭走來。他看見柳如煙，忽然停下腳步。",
        choices: []
    },
    // 第 33 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_room",
        character: "柳如煙",
        expression: "normal",
        text: "「妳是……以前常來這裡的那個小女孩？」柳如煙愣住了。「您認得我？」老先生仔細看了她一會兒，點點頭。",
        choices: []
    },
    // 第 33 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_room",
        character: "柳如煙",
        expression: "normal",
        text: "「我不敢說一定認得，但妳以前常常和一個男孩子來這裡。每次活動結束，兩個人都不肯馬上回家，總說還有事情沒做完。」",
        choices: []
    },
    // 第 33 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_room",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙的神情一下子變得認真。「那個男孩子……您還記得他嗎？」老先生皺起眉頭，像是在努力回想。",
        choices: [
            {
                text: "請老先生仔細回想，那兩個孩子當年做過什麼",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("entered_old_center")) {
                        return "老先生把紙箱放在地上，慢慢說道：「我記得有一年辦星空活動，那個男孩子一直拿著一張紙，說要寫下和朋友的約定。小女孩則在旁邊畫星星，還說要把那張紙好好收起來。」柳如煙聽到這裡，忽然按住胸口，像是有什麼畫面快要浮現。「那張紙……後來呢？」老先生搖搖頭。「這我就不知道了。只記得活動結束後，他們好像把東西交給了彼此，又好像沒有。」他說得不太確定，反而讓這段記憶更難判斷。";
                    }

                    return "老先生想了想，說：「以前的孩子常在這裡玩，有些事情我也記不清了。不過，那年的星空活動確實很熱鬧，還有孩子說要把一個約定寫下來。」柳如煙立刻追問是誰，老先生卻搖了搖頭。「太久了，我真的想不起來。」你們只好先記住這個細節。";
                },
                special: "asked_manager_memories",
                flag: "asked_manager_memories"
            },
            {
                text: "先不追問過去，問老先生活動中心是否還有舊物品",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("offered_letter_search_help")) {
                        return "你問老先生，這裡是否還留著以前活動的紀錄或物品。他點點頭，指向走廊盡頭的儲藏室。「有些舊東西還沒整理完，不過裡面很亂，得慢慢找。」柳如煙聽見後，立刻看向那個方向。她壓低聲音說：「如果那封信真的曾經放在這裡，也許還有機會找到。」說完，她才發現自己不小心說漏了嘴。";
                    }

                    return "你詢問活動中心是否還留著舊物品。老先生點點頭，說儲藏室裡還有幾箱以前活動留下來的東西，只是尚未整理完畢。柳如煙看著儲藏室的方向，似乎很想立刻過去，但又猶豫著沒有開口。";
                },
                special: "asked_about_old_items",
                flag: "asked_about_old_items"
            }
        ]
    },
    // ==============================
    // 第 34 幕：儲藏室裡的紙箱
    // ==============================
    // 第 34 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "在老先生的帶領下，你們來到走廊盡頭的儲藏室。房間裡堆滿了紙箱，空氣中混著灰塵與紙張的氣味。",
        choices: []
    },
    // 第 34 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "老先生提醒你們，有些東西還沒整理，找到什麼都先別急著丟掉。柳如煙蹲在一個標著「星空活動」的紙箱前，手指停在箱蓋上。",
        choices: []
    },
    // 第 34 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "「我不知道裡面會有什麼……」她看了你一眼，勉強笑了笑。「如果真的找到以前的東西，我可能會想起一些事情；但如果什麼都沒有，我又該怎麼辦？」",
        choices: []
    },
    // 第 34 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "她沒有立刻打開紙箱，而是等著你的回答。",
        choices: [
            {
                text: "告訴她，不管找到什麼，你都會陪她一起面對",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("offered_to_listen")) {
                        return "你告訴她，她不必急著想起一切，也不需要獨自承受那些不確定。柳如煙看著你，原本緊繃的肩膀慢慢放鬆。「你以前好像也說過類似的話。」她說完便愣住了，像是連自己都沒料到會說出這句話。她打開紙箱，裡面有舊海報、活動名冊，以及幾張被折起來的手繪星圖。她小心地把每一樣東西取出來，卻在箱底看見一個沒有標籤的小紙袋。";
                    }

                    return "你告訴她，不必因為害怕失望就放棄尋找。柳如煙安靜了片刻，點點頭。「好，那我們一起找。」紙箱裡裝著舊海報、活動名冊和幾張手繪星圖。她一張張翻看，最後在箱底發現一個沒有標籤的小紙袋。";
                },
                special: "comforted_during_search",
                flag: "comforted_during_search"
            },
            {
                text: "先整理紙箱，從活動日期和物品標籤開始查起",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("asked_manager_memories")) {
                        return "你提議先從活動名冊和日期查起，看看能不能對上老先生的回憶。柳如煙立刻拿起名冊，認真比對上面的年份。翻到某一頁時，她忽然停住：「這一年……我記得那時候有一場特別的星空活動。」名冊旁夾著一張褪色的活動照片，但照片只拍到活動場地，角落裡似乎有一小段被裁掉的文字。她沒有急著拿走照片，而是先把它放在一旁，繼續整理剩下的物品。";
                    }

                    return "你們決定先依照標籤整理物品。從活動名冊和舊海報中，你們確認這裡曾經舉辦過好幾次星空觀測活動。柳如煙看著其中一張褪色的海報，低聲說：「我總覺得那一天對我很重要。」就在這時，你注意到紙箱底部露出一個沒有標籤的小紙袋。";
                },
                special: "searched_by_dates",
                flag: "searched_by_dates"
            }
        ]
    },
    // ==============================
    // 第 35 幕：紙袋上的記號
    // ==============================
    // 第 35 段（1/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "那個沒有標籤的小紙袋安靜地躺在紙箱底部。紙袋已經泛黃，封口處還留著一小段褪色的藍色線條。柳如煙伸手想拿起來，卻在碰到紙袋前停住了。",
        choices: []
    },
    // 第 35 段（2/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "「奇怪……我好像在哪裡看過這個記號。」她仔細看著那條藍色線條，眉頭越皺越緊，卻始終想不起來。",
        choices: []
    },
    // 第 35 段（3/3 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "老先生正在外面整理其他物品，暫時沒有注意到你們。你們有一點時間，可以自己決定接下來怎麼做。",
        choices: [
            {
                text: "仔細檢查紙袋上的藍色記號，試著找出規律",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("searched_by_dates")) {
                        return "你把紙袋放在桌上，拿出剛才整理的活動名冊，逐頁比對日期與記號。終於，你在一張舊海報的角落看見相似的藍色線條——那是當年星空活動用來標記觀測方向的符號。柳如煙立刻湊過來，眼神變得認真。「這個記號……不只是裝飾。」她小心地打開紙袋外層，裡面卻只有一張折疊的紙片，上面寫著幾個模糊的字：「北方……第三顆……」後面的文字已經被水漬暈開。";
                    }

                    return "你仔細觀察紙袋上的藍色線條，發現它並不像隨手畫出的塗鴉，而是由幾個短線組成的記號。柳如煙盯著它看了很久，忽然說：「我以前好像也畫過類似的東西。」她打開紙袋外層，裡面有一張折疊的紙片，但上面的字跡已經模糊，只能勉強辨認出「北方」兩個字。";
                },
                special: "examined_blue_mark",
                flag: "examined_blue_mark"
            },
            {
                text: "先詢問柳如煙是否真的想打開，不替她擅自決定",
                affection: 2,
                trust: 4,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("respected_her_privacy")) {
                        return "你沒有碰紙袋，而是先問她是否真的想打開。柳如煙看著你，似乎想起了你以前願意給她空間的樣子。「謝謝你，沒有直接替我決定。」她深吸一口氣，這才親手拿起紙袋。她沒有立刻拆開，而是先仔細看著封口，接著輕聲說：「我想自己打開。不管裡面是什麼，這次我不想再逃避了。」紙袋裡露出一張折疊的紙片，但她暫時沒有展開。";
                    }

                    return "你把決定權交還給柳如煙。她沉默了一會兒，最後點頭說：「既然是我想找的東西，我應該自己決定。」她親手打開紙袋，裡面露出一張折疊的紙片。她看見紙片上的字跡時，手指微微顫了一下，卻沒有馬上展開。";
                },
                special: "let_her_decide",
                flag: "let_her_decide"
            }
        ]
    },
    // ==============================
    // 第 36 幕：星圖上缺少的星星
    // ==============================
    // 第 36 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "你們沒有急著離開，而是繼續翻找紙箱裡的舊物品。柳如煙把那張寫著「北方……第三顆……」的紙片放在桌上，旁邊則攤開一張當年的星空活動海報。",
        choices: []
    },
    // 第 36 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "海報上畫著幾條簡單的星座連線，右上角還標示著觀測方向。你試著比對紙片和海報，卻發現海報上的星星排列似乎少了一個記號。",
        choices: []
    },
    // 第 36 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙拿起紙片，反覆看了幾遍。「如果這不是活動紀錄，而是某個人特別留下的提示呢？」她抬頭看向你。",
        choices: []
    },
    // 第 36 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "「你覺得，我們應該先相信紙片上的文字，還是先弄清楚這張星圖原本畫了什麼？」",
        choices: [
            {
                text: "先研究星圖，找出被刪掉的記號可能在哪裡",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("examined_blue_mark")) {
                        return "你把注意力放在海報上的藍色記號，發現它和紙袋封口的線條有相同的轉折。你沿著星圖上的觀測方向比對，終於找到一處不自然的空白：那裡原本似乎畫著一顆星，後來卻被人用橡皮擦淡了。柳如煙湊近觀察，輕聲說：「這個位置……好像不是隨便選的。」她拿起筆，卻沒有直接補上星星，而是先把位置和方向記下來。";
                    }

                    return "你仔細研究海報上的星星排列，發現右上角有一處模糊的空白，周圍還留著擦拭過的痕跡。柳如煙也注意到了這個地方。「有人曾經在這裡畫過東西，後來又把它擦掉了。」她小心地記下位置，卻還無法確定那顆星代表什麼。";
                },
                special: "studied_star_map",
                flag: "studied_star_map"
            },
            {
                text: "先研究紙片，確認「北方」和「第三顆」指的是什麼",
                affection: 2,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("let_her_decide")) {
                        return "你把紙片轉了幾個方向，試著理解文字的意思。柳如煙也拿出紙袋，檢查背面是否還有留下其他字跡。過了一會兒，她在紙袋內側發現一道幾乎看不見的鉛筆痕跡，像是某個人的名字開頭，卻已經無法辨認。「原來不只是紙片，連紙袋本身都可能藏著東西。」她沒有急著猜測名字，只把這個發現記下來，接著重新看向那幾個字。";
                    }

                    return "你們試著從紙片上的文字找答案，但「北方」和「第三顆」可能代表方向、星星，也可能是其他編號。柳如煙想了一會兒，搖頭說：「光靠這幾個字，還不能確定意思。」她把紙片收好，決定先保留這個問題，等找到更多資料再判斷。";
                },
                special: "studied_paper_hint",
                flag: "studied_paper_hint"
            }
        ]
    },
    // ==============================
    // 第 37 幕：雨聲裡的習慣
    // ==============================
    // 第 37 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_window_rain",
        character: "柳如煙",
        expression: "normal",
        text: "你們整理完紙箱時，窗外忽然下起雨。雨滴打在老舊的鐵皮屋頂上，發出規律的聲響。",
        choices: []
    },
    // 第 37 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_window_rain",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙原本還在研究那張星圖，聽見雨聲後，手指卻不自覺地在桌面上輕敲了幾下。她自己似乎也察覺到了，慢慢停下動作。",
        choices: []
    },
    // 第 37 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_window_rain",
        character: "柳如煙",
        expression: "normal",
        text: "「好奇怪……我以前好像常常和一個人一起聽雨。」她望向窗外，眼神有些迷惘。",
        choices: []
    },
    // 第 37 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_window_rain",
        character: "柳如煙",
        expression: "normal",
        text: "「那個人每次想事情的時候，也會這樣敲手指。我一直記得這個習慣，卻怎麼也想不起他的臉。」她轉過頭看你，猶豫了一會兒。",
        choices: []
    },
    // 第 37 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_window_rain",
        character: "柳如煙",
        expression: "normal",
        text: "「你會不會也有某個人，明明想不起來了，卻還記得他做過的小事？」",
        choices: [
            {
                text: "告訴她，自己也注意過她敲手指的習慣",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("noticed_finger_tapping")) {
                        return "你告訴她，自己早就注意到她思考時會敲手指。柳如煙睜大眼睛，像是終於找到某個能確認的細節。「你也注意到了……」她低頭看著自己的手。「以前那個人也一樣，每次不知道怎麼回答我的問題，就會一直敲手指。我曾經笑他，說只要看他的手就知道他在想什麼。」她說著說著，忽然停住。「可是，我為什麼會覺得你剛才的動作也很熟悉？」";
                    }

                    return "你告訴她，自己曾經看過她敲手指，但不確定這是不是她記憶中的習慣。柳如煙輕輕點頭。「也許是我把不同的記憶混在一起了。」她沒有勉強自己繼續回想，只是把這個細節寫在紙上，提醒自己以後再確認。";
                },
                special: "connected_tapping_memory",
                flag: "connected_tapping_memory"
            },
            {
                text: "陪她聽一會兒雨，不急著要求她想起那個人",
                affection: 2,
                trust: 4,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("talked_about_rain")) {
                        return "你沒有追問，只是坐在她身旁，一起聽著雨聲。過了一會兒，柳如煙忽然開口：「你知道嗎？以前我很喜歡下雨天，因為有人說，雨聲可以把不想說出口的話藏起來。」她轉頭看你，眼神比剛才柔和了些。「我不知道那個人到底是誰，但我記得，跟他待在一起的時候，就算不說話也不會覺得尷尬。」這句話讓你心裡浮現一種難以形容的熟悉感。";
                    }

                    return "你沒有要求她立刻想起任何事，只陪她安靜地聽雨。柳如煙慢慢放鬆下來，輕聲說：「謝謝你。有時候我真的很怕，自己努力找回來的記憶，最後卻只是一些拼湊出來的想像。」雨聲持續落下，你們誰也沒有急著打破沉默。";
                },
                special: "listened_to_rain_together",
                flag: "listened_to_rain_together"
            }
        ]
    },
    // ==============================
    // 第 38 幕：被留下的日期
    // ==============================
    // 第 38 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "雨勢稍微變小後，老先生抱著一本厚厚的紀錄簿走進儲藏室。「我剛才在辦公室找到這個，或許對你們有幫助。」",
        choices: []
    },
    // 第 38 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "他把紀錄簿放在桌上，封面寫著多年前的活動年份。柳如煙立刻翻開，裡面記錄著每次活動的日期、參加人數，以及一些簡短的備註。",
        choices: []
    },
    // 第 38 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "翻到星空活動的那一頁時，她忽然停住了。那天的備註旁畫著一顆小小的星星，下面還寫著一句話：「活動結束後，兩名孩子留下，表示有重要的約定。」",
        choices: []
    },
    // 第 38 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_storage",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙盯著那行字，久久沒有說話。她終於找到一項確實存在的紀錄，卻仍然不知道那個約定究竟是什麼。",
        choices: [
            {
                text: "仔細記下活動日期，並和之前的星圖互相比對",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("studied_star_map")) {
                        return "你把紀錄簿上的日期抄下來，接著拿出先前發現的星圖。你們比對後發現，星圖上的記號與那天的活動紀錄確實有關聯，但目前仍缺少一個能確認日期的關鍵資料。柳如煙認真地看著兩份紀錄，說：「我們至少知道，那不是我自己想像出來的事情。」她把日期和星圖的關係寫進筆記，並提醒自己還不能急著下結論。";
                    }

                    return "你記下紀錄簿上的日期，並把旁邊的星星圖案也畫了下來。柳如煙看著你的筆記，點頭說：「至少我們有一個能確認的日期了。」她把那一頁的內容記下來，決定之後再找其他資料核對，避免只憑模糊的回憶判斷。";
                },
                special: "recorded_event_date",
                flag: "recorded_event_date"
            },
            {
                text: "詢問老先生，當年留下來的兩個孩子是否有其他紀錄",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("asked_manager_memories")) {
                        return "老先生努力回想了一會兒，說：「我不記得他們的名字了，但我記得其中一個孩子很在意另一個人有沒有把話說清楚。那天活動結束後，他們好像還在爭論一件事，後來又一起笑了。」柳如煙低下頭，像是被這句話觸動了。「我不記得那天發生過爭論……可是，我好像記得那種感覺。」老先生提醒你們，人的記憶會出錯，紀錄也可能不完整，最好還是繼續尋找能互相印證的證據。";
                    }

                    return "老先生搖搖頭，表示紀錄簿裡沒有留下孩子們的名字，只記載了活動結束後有人逗留。柳如煙有些失望，卻還是向他道謝。「至少我們知道，那天真的發生過某件重要的事。」她把這項資訊寫進筆記，沒有再勉強老先生回想更多。";
                },
                special: "asked_about_children",
                flag: "asked_about_children"
            }
        ]
    },
    // ==============================
    // 第 39 幕：河堤上的舊地址
    // ==============================
    // 第 39 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "riverside_evening",
        character: "柳如煙",
        expression: "normal",
        text: "離開活動中心前，老先生忽然想起一件事。他說，當年有些孩子會在活動結束後，沿著河堤走到附近的舊觀景台。",
        choices: []
    },
    // 第 39 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "riverside_evening",
        character: "柳如煙",
        expression: "normal",
        text: "那裡曾經是社區居民觀星的地方，後來因為設施老舊，已經很少有人前往。",
        choices: []
    },
    // 第 39 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "riverside_evening",
        character: "柳如煙",
        expression: "normal",
        text: "你們照著老先生指的方向走去。傍晚的河面映著夕陽，遠處的路燈一盞盞亮起。柳如煙站在欄杆旁，望著河水出神。「我好像來過這裡。」她說。",
        choices: []
    },
    // 第 39 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "riverside_evening",
        character: "柳如煙",
        expression: "normal",
        text: "「以前有個人告訴我，只要站在這裡，就能看見很漂亮的星空。」",
        choices: []
    },
    // 第 39 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "riverside_evening",
        character: "柳如煙",
        expression: "normal",
        text: "她停頓了一下，接著苦笑：「可是我不記得那個人是誰，也不記得我們最後有沒有真的看見星星。」",
        choices: [
            {
                text: "問她是否記得那個人曾經說過的其他話",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("listened_to_rain_together")) {
                        return "你問她，那個人除了星空，還有沒有說過其他讓她印象深刻的話。柳如煙望著河面，慢慢回想：「他好像說過，就算有一天忘記彼此的樣子，也可以靠著一起經歷過的事情重新認出對方。」她說完後，自己也愣住了。「我不知道這句話是不是他真的說過的，但每次想起那個人，我就會想到這句話。」";
                    }

                    return "柳如煙努力回想，卻只記得一些零碎的片段。她說，那個人曾經提過星空，也曾答應陪她去看一次真正的星星。至於其他事情，她仍然沒有清楚的印象。「我怕自己把夢裡的內容當成真的了。」她坦白說。";
                },
                special: "asked_about_old_words",
                flag: "asked_about_old_words"
            },
            {
                text: "先沿著河堤走走，看看附近是否還有以前的觀星設施",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_event_date")) {
                        return "你們沿著河堤往前走，發現一塊已經褪色的指示牌，上面標著舊觀景台的位置。牌子下方還刻著一個年份，和活動紀錄簿上的日期很接近。柳如煙拿出筆記比對，發現兩者可能有關聯，但年份的最後一位已經磨損，還不能完全確認。「如果能找到當年的照片，或許就能知道這裡到底發生過什麼。」她說。";
                    }

                    return "你們沿著河堤慢慢走，最後找到一塊褪色的指示牌，上面標著舊觀景台的方向。柳如煙望著遠處被樹木遮住的路，輕聲說：「以前的路好像比較短。」她不確定這是因為自己長大了，還是真的忘記了什麼。";
                },
                special: "walked_riverside",
                flag: "walked_riverside"
            }
        ]
    },
    // ==============================
    // 第 40 幕：第三顆星
    // ==============================
    // 第 40 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "你們沿著河堤旁的小路走上舊觀景台。木製欄杆已經斑駁，角落還留著一張褪色的星空導覽圖。柳如煙站在導覽圖前，輕輕拂去表面的灰塵。",
        choices: []
    },
    // 第 40 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "圖上標示著幾個方向，北方的位置畫著一組排列成線的星星。她忽然想起儲藏室裡的紙片，低聲念道：「北方……第三顆……」",
        choices: []
    },
    // 第 40 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "她沿著圖上的星星一顆顆數過去，卻發現第三顆的位置被刮掉了一部分，只剩下淡淡的痕跡。柳如煙伸手碰了碰那道刮痕，眼神逐漸認真起來。",
        choices: []
    },
    // 第 40 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "「如果這真的是留下來的提示，那麼有人可能希望我找到這顆星。」她轉頭問你：「你覺得，我們應該先研究這張圖，還是先想辦法找回被刮掉的部分？」",
        choices: [
            {
                text: "仔細比對星圖和紙片上的記號",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("examined_blue_mark") && storyFlags.has("studied_star_map")) {
                        return "你拿出先前記下的藍色記號，與導覽圖上的線條逐一比對。幾個轉折竟然完全吻合。你們確認紙片上的「第三顆」應該指向北方星列中的第三個位置，而不是一般的活動編號。柳如煙將這個發現記在筆記裡，卻沒有急著補完答案。「我們找到方向了，但還不知道這顆星為什麼對那個人這麼重要。」她說。";
                    }

                    if (storyFlags.has("examined_blue_mark") || storyFlags.has("studied_star_map")) {
                        return "你把先前看過的記號和眼前的星圖放在一起比較，發現它們有幾處相似之處。雖然還不能確認完整含義，但「北方」和「第三顆」很可能是在指這張導覽圖上的某個位置。柳如煙記下了可能的方向，決定繼續尋找能驗證猜測的證據。";
                    }

                    return "你仔細觀察導覽圖，發現北方的星星排列並非隨意畫成一列，而是按照固定的方向標示。柳如煙將紙片上的文字抄在筆記裡，卻暫時無法確認兩者是否真的有關。你們決定先記下這個位置，避免過早認定答案。";
                },
                special: "identified_third_star",
                flag: "identified_third_star"
            },
            {
                text: "尋找觀景台附近的舊標記，看看是否有人留下其他提示",
                affection: 2,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("walked_riverside")) {
                        return "你們沿著觀景台的欄杆仔細查看，最後在一根木柱底部發現幾道淺淺的刻痕。刻痕旁有一個小小的星形符號，下面似乎還有字，但經過多年風吹雨打，已經難以辨認。柳如煙蹲下來看了很久，忽然說：「這裡不像是公共設施原本就有的標記。」她沒有擅自刮除木柱上的痕跡，而是把位置記下來，打算先查清楚它的來歷。";
                    }

                    return "你們在觀景台周圍找了一會兒，最後在一根木柱上發現一個模糊的星形刻痕。它看起來像是有人留下的記號，但沒有足夠證據能確認它和童年約定有關。柳如煙將位置記下來，決定之後再回來調查。";
                },
                special: "searched_observatory_marks",
                flag: "searched_observatory_marks"
            }
        ]
    },
    // ==============================
    // 第 41 幕：有人回來過
    // ==============================
    // 第 41 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "你們正準備離開觀景台時，柳如煙忽然注意到導覽圖旁有一個生鏽的小鐵盒。鐵盒被固定在木板後方，外表沾滿灰塵，像是已經放了很久。",
        choices: []
    },
    // 第 41 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "你們沒有強行拆開，而是仔細查看盒子的外側。盒蓋上有一道較新的刮痕，底部卻已經嚴重鏽蝕，讓人分不清它究竟放了幾年。",
        choices: []
    },
    // 第 41 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙蹲下來，盯著那道刮痕看了很久。「如果這個盒子以前就放在這裡……會不會有人曾經回來找過什麼？」她抬頭看著你，語氣裡有期待，也有不安。",
        choices: []
    },
    // 第 41 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "「可是，我不想因為太希望找到答案，就把每一件東西都當成證據。」",
        choices: [
            {
                text: "先拍下鐵盒的位置與外觀，找管理單位確認",
                affection: 1,
                trust: 4,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("searched_observatory_marks")) {
                        return "你先拍下鐵盒與木柱刻痕的位置，並記錄它們彼此的距離。比對之後，你發現兩者都靠近導覽圖的北方標示，但這也可能只是觀景台原本的設計。柳如煙認同你的做法：「先留下能確認的事實，再慢慢找答案。」她把照片存進手機，決定詢問老先生是否知道鐵盒的來歷。";
                    }

                    return "你拍下鐵盒的外觀與固定位置，沒有擅自打開它。柳如煙看著你保存的照片，稍微安心了一些。「這樣至少不會因為我們記錯，而把事情越想越複雜。」她決定先向老先生確認鐵盒是否屬於活動中心的舊物品。";
                },
                special: "documented_metal_box",
                flag: "documented_metal_box"
            },
            {
                text: "詢問柳如煙，她看見鐵盒時是否想起了什麼",
                affection: 3,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("connected_tapping_memory")) {
                        return "你問她是否想起了什麼。柳如煙沒有立刻回答，只是用手指輕敲膝蓋。過了一會兒，她忽然說：「我好像記得，有人曾經說過，重要的東西不一定要放在最安全的地方，而是要放在自己還記得怎麼找到的地方。」她說完後，自己也露出困惑的神情。「可是，我不知道這句話是不是那個人說的。」你們沒有因此認定鐵盒就是約定的答案，只把這段新浮現的話記了下來。";
                    }

                    return "柳如煙仔細看著鐵盒，最後搖了搖頭。「我沒有想起具體的事情，只是覺得它出現在這裡很奇怪。」她沒有掩飾自己的失望，卻也沒有放棄。「我想先弄清楚它是誰放的，再決定要不要繼續查。」";
                },
                special: "asked_about_box_memory",
                flag: "asked_about_box_memory"
            }
        ]
    },
    // ==============================
    // 第 42 幕：管理員的舊鑰匙
    // ==============================
    // 第 42 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_office",
        character: "柳如煙",
        expression: "normal",
        text: "你們回到活動中心，把觀景台上發現的鐵盒告訴老先生。老先生聽完後，沉默了一會兒，接著從抽屜裡拿出一本舊物品登記簿。",
        choices: []
    },
    // 第 42 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_office",
        character: "柳如煙",
        expression: "normal",
        text: "「觀景台以前確實放過一些活動用品，不過那裡的設施後來整修過，很多東西都移走了。」他翻找了幾頁，終於停在一筆模糊的紀錄前。",
        choices: []
    },
    // 第 42 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_office",
        character: "柳如煙",
        expression: "normal",
        text: "上面寫著：「小型金屬盒一只，暫存觀測紀錄，移交日期不明。」柳如煙立刻靠近桌邊。「那裡面會不會有以前的星圖？」老先生搖搖頭。",
        choices: []
    },
    // 第 42 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_office",
        character: "柳如煙",
        expression: "normal",
        text: "「有可能，但沒有打開之前，誰也不能確定。」他拿出一把舊鑰匙，卻沒有立刻交給你們。",
        choices: []
    },
    // 第 42 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "老管理員",
        background: "old_center_office",
        character: "柳如煙",
        expression: "normal",
        text: "「如果那個盒子確實屬於活動中心，我可以陪你們回去確認。但不能只因為它看起來神祕，就認定裡面一定有你們要找的答案。」",
        choices: [
            {
                text: "拿出拍下的照片，請老先生核對鐵盒的位置",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("documented_metal_box")) {
                        return "你把鐵盒的照片拿給老先生看。他仔細比對後，指著盒蓋邊緣的一處凹痕說：「這個樣式，和以前活動中心保管的盒子很像。」他仍然無法確認是不是同一個，但願意陪你們回觀景台查看。柳如煙看著照片，低聲說：「至少我們不是只憑感覺猜測了。」老先生將鑰匙收進口袋，提醒你們，接下來必須先確認鐵盒的所有權與安全狀況。";
                    }

                    return "你向老先生描述鐵盒的位置與外觀。他聽完後，表示以前確實有類似的保管盒，但光憑描述還不能確定。柳如煙提議下次把位置拍下來，再請他核對。老先生點點頭，答應先查清楚登記簿上的移交紀錄。";
                },
                special: "verified_box_record",
                flag: "verified_box_record"
            },
            {
                text: "先詢問登記簿上「觀測紀錄」的內容",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_event_date")) {
                        return "你拿出之前記下的星空活動日期，請老先生看看是否與登記簿的紀錄吻合。老先生逐一比對，發現其中一筆移交紀錄的年份與那場活動相近，但日期欄已經模糊，還無法確認是否同一天。「這表示盒子可能和那批活動用品有關，但不能直接證明它裡面藏著你們要找的東西。」他說。柳如煙把兩個日期並排記下，決定先保留這項關聯，等取得更多證據再下結論。";
                    }

                    return "你詢問登記簿裡的「觀測紀錄」究竟是什麼。老先生解釋，那可能包括活動時使用的星圖、觀測筆記或器材清單，但當年的詳細內容並沒有全部保存下來。柳如煙聽完後，請他把這筆紀錄的頁碼記下來，方便之後繼續查找。";
                },
                special: "checked_box_inventory",
                flag: "checked_box_inventory"
            }
        ]
    },
    // ==============================
    // 第 43 幕：鐵盒裡的舊紙條
    // ==============================
    // 第 43 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "隔天，老先生帶著鑰匙陪你們回到舊觀景台。他先確認鐵盒確實是活動中心留下的舊物，才小心地將它取下。",
        choices: []
    },
    // 第 43 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "盒子打開後，裡面沒有想像中的珍貴物品，只有幾張泛黃的觀測紀錄、一小段藍色細繩，以及一張折了兩次的紙條。",
        choices: []
    },
    // 第 43 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙看見紙條時，呼吸忽然停了一瞬。紙條上沒有完整的句子，只寫著：「如果有一天忘記了，就回到我們第一次約定的地方。」",
        choices: []
    },
    // 第 43 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "下面還畫著一顆小星星。她伸手想拿起紙條，又猶豫地看向老先生。老先生點頭，表示可以先拍照記錄，再把物品妥善保存。",
        choices: []
    },
    // 第 43 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙低聲說：「我們第一次約定的地方……到底是哪裡？」",
        choices: [
            {
                text: "仔細比對紙條上的星星與之前的星圖",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("identified_third_star") && storyFlags.has("examined_blue_mark")) {
                        return "你把紙條上的星星和先前記下的藍色記號、北方星列放在一起比較。星形的畫法有些相似，但紙條上的圖案太簡單，還不能證明它們來自同一個人。柳如煙卻像是想起什麼似的，輕聲說：「以前那個人畫星星時，總會把其中一角畫得特別長。」你們仔細看過後，發現紙條上的星星確實有一角比較突出。這個細節值得記下，但仍需要其他證據才能確認。";
                    }

                    return "你仔細看著紙條上的星星，發現其中一角比其他部分長了一些。柳如煙也注意到了這個細節，便把圖案畫進筆記裡。「也許這是某個人的習慣，也可能只是隨手畫的。」她提醒自己不要太早下結論，接著將紙條交由老先生妥善保存。";
                },
                special: "compared_box_star",
                flag: "compared_box_star"
            },
            {
                text: "先讀取觀測紀錄，確認鐵盒原本保存的資料",
                affection: 2,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("checked_box_inventory")) {
                        return "你們先整理鐵盒裡的觀測紀錄。幾張紙記載著當年的觀測方向與活動器材，其中一頁寫著「活動結束後，資料交由兩名參加者保管」，但沒有留下姓名。老先生看著紀錄，說這可能解釋了為什麼部分資料沒有留在活動中心。柳如煙低頭看著那張紙，慢慢說：「所以，有些東西可能是被人帶走了，而不是弄丟了。」她把這項發現記下，決定繼續尋找能確認保管者身分的資料。";
                    }

                    return "你們逐張檢查觀測紀錄，發現其中幾頁只記載了活動流程，沒有提到任何人的名字。柳如煙找到一張寫著觀測方向的紙，將上面的內容抄下來。雖然沒有直接答案，但她認為這些資料可能有助於理解紙條上的提示。";
                },
                special: "read_observation_records",
                flag: "read_observation_records"
            }
        ]
    },
    // ==============================
    // 第 44 幕：第一次約定的地方
    // ==============================
    // 第 44 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_observatory_platform",
        character: "柳如煙",
        expression: "normal",
        text: "離開觀景台後，柳如煙一路看著手機裡拍下的紙條。",
        choices: []
    },
    // 第 44 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "normal",
        text: "走到老社區附近時，她忽然停下腳步，望向一座藏在巷子裡的小公園。公園裡的遊具早已換過，只有角落那棵老樹還留著熟悉的枝幹。",
        choices: []
    },
    // 第 44 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "normal",
        text: "她慢慢走近樹下，伸手摸了摸粗糙的樹皮。「我好像……曾經在這裡等過一個人。」她閉上眼睛，努力回想。",
        choices: []
    },
    // 第 44 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "normal",
        text: "「那天好像下著雨，我們躲在樹下，聊到長大以後要做什麼。後來，他說要帶我去看星星。」她睜開眼睛，卻仍然想不起那個人的臉。",
        choices: []
    },
    // 第 44 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "normal",
        text: "「我不知道這是不是第一次約定的地方，但這裡的感覺……真的很熟悉。」",
        choices: [
            {
                text: "問她能不能想起那天約定的具體內容",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("asked_about_old_words")) {
                        return "你問她，那天除了看星星之外，還有沒有說過其他內容。柳如煙沉默了很久，終於想起一段模糊的對話：「好像有人說，就算以後走散了，也要記得回來找對方。」她握緊手機，低聲說：「我以前一直覺得，只要我記得這句話，就一定能找到他。可是現在，我甚至不知道他是不是也記得。」她沒有把這段回憶當成確定的事實，只將它寫進筆記，等待其他證據來驗證。";
                    }

                    return "柳如煙努力回想，卻只能記得自己曾經期待過一片星空。她不確定那天是否真的說過什麼約定，只記得對方似乎答應過她一件事。「我需要更多線索，不能只靠感覺判斷。」她說完，便把公園的位置記下來。";
                },
                special: "recalled_first_promise",
                flag: "recalled_first_promise"
            },
            {
                text: "先觀察老樹周圍，看看是否有留下的舊記號",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("compared_box_star")) {
                        return "你們沿著老樹周圍查看，發現樹根旁的石椅底部刻著一顆小星星，其中一角比其他部分長。你拿出紙條照片比對，畫法看起來相似，但刻痕已經風化，還不足以證明兩者出自同一人。柳如煙蹲在石椅旁，輕聲說：「如果這個記號真的和那張紙有關，也許我們離答案更近了。」你們拍下石椅與刻痕的位置，沒有擅自破壞或刮除任何痕跡。";
                    }

                    return "你們仔細查看老樹周圍，最後在石椅底部發現一個模糊的星形刻痕。它可能是以前的孩子留下的，也可能只是普通的塗鴉。柳如煙將位置記下來，打算等找到更多相似圖案後再進行比對。";
                },
                special: "searched_old_tree",
                flag: "searched_old_tree"
            }
        ]
    },
    // ==============================
    // 第 45 幕：記憶中的那個男孩
    // ==============================
    // 第 45 段（1/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "bedroom",
        character: "柳如煙",
        expression: "normal",
        text: "那天晚上，你回到家後，腦海裡一直浮現小公園的老樹。你打開手機，重新看過這幾天拍下的照片：星圖、紙條、鐵盒，還有石椅底部的小星星。",
        choices: []
    },
    // 第 45 段（2/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "bedroom",
        character: "柳如煙",
        expression: "normal",
        text: "雨聲從窗外傳來，你不自覺地用手指敲了敲桌面。",
        choices: []
    },
    // 第 45 段（3/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "childhood_memory_rain",
        character: "柳如煙",
        expression: "normal",
        text: "就在那一瞬間，一段陌生又熟悉的畫面突然湧入腦海。夢裡的你似乎年紀很小，正坐在老樹下，手裡拿著一張折好的紙。",
        choices: []
    },
    // 第 45 段（4/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "childhood_memory_rain",
        character: "柳如煙",
        expression: "normal",
        text: "身旁的女孩低頭畫著星星，問你：「如果有一天我們忘記彼此了，怎麼辦？」",
        choices: []
    },
    // 第 45 段（5/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "childhood_memory_rain",
        character: "柳如煙",
        expression: "normal",
        text: "年幼的你想了一會兒，回答：「那就把重要的事情留下來，總有一天，我們會找到答案。」畫面到這裡突然中斷。",
        choices: []
    },
    // 第 45 段（6/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "bedroom",
        character: "柳如煙",
        expression: "normal",
        text: "你睜開眼睛，發現自己仍坐在書桌前，卻已經想不起那個女孩的長相。你開始懷疑，那段記憶或許不只是夢。",
        choices: [
            {
                text: "立刻把夢境與之前的線索全部記錄下來",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (
                        storyFlags.has("recalled_first_promise") &&
                        storyFlags.has("listened_to_rain_together")
                    ) {
                        return "你立刻記下夢裡的對話，再把它和柳如煙回憶中的約定放在一起比較。兩段內容雖然不完全相同，卻都提到了忘記彼此，以及重新找到對方的方法。你還記下雨聲響起時自己敲手指的動作，發現這個習慣也和柳如煙的描述相符。你無法因此確定自己的身分，但第一次有了足夠具體的理由，認真調查自己的童年。「如果這些記憶是真的……」你低聲說，卻沒有把後半句說出口。";
                    }

                    return "你把夢境中的老樹、折好的紙，以及女孩說過的話全部記下來。雖然還無法確認它們與柳如煙的回憶有什麼關係，但你不想再讓這些片段像以前一樣消失。你決定之後找時間重新整理所有線索。";
                },
                special: "recorded_childhood_memory",
                flag: "recorded_childhood_memory"
            },
            {
                text: "先不急著記錄，試著回想女孩的聲音與神情",
                affection: 2,
                trust: 1,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("searched_old_tree")) {
                        return "你閉上眼睛，努力回想女孩的聲音。她的臉依舊模糊，但你記得她坐在老樹下，手裡畫著一顆小星星。那顆星星有一角特別長，和你們在石椅上發現的記號很相似。你睜開眼睛，心跳快了幾分。也許這些記憶確實指向同一段過去，但你仍需要其他證據，才能知道女孩究竟是誰。";
                    }

                    return "你閉上眼睛，試著留住女孩的聲音。她的語氣很熟悉，卻始終無法和任何一張清楚的臉連在一起。你越努力回想，畫面反而越模糊。最後，你只記住她坐在老樹下畫星星的樣子，決定暫時不再勉強自己。";
                },
                special: "recalled_childhood_voice",
                flag: "recalled_childhood_voice"
            }
        ]
    },
    // ==============================
    // 第 46 幕：相似的夢境
    // ==============================
    // 第 46 段（1/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "normal",
        text: "隔天放學後，你請柳如煙留一下。教室裡只剩下夕陽照進窗邊的光影。",
        choices: []
    },
    // 第 46 段（2/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "normal",
        text: "你猶豫了一會兒，才告訴她昨晚想起的童年片段：老樹、雨聲、一張折好的紙，以及女孩問過的那句話。「如果有一天我們忘記彼此了，怎麼辦？」",
        choices: []
    },
    // 第 46 段（3/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "normal",
        text: "聽見這句話，柳如煙原本握著筆的手忽然停住。她沒有立刻回答，只是反覆確認你記得的內容。",
        choices: []
    },
    // 第 46 段（4/4 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "柳如煙",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "normal",
        text: "過了很久，她才低聲說：「我好像也聽過類似的話……可是，我不確定那是不是同一天發生的事。」她看著你，眼神裡既有期待，也有害怕認錯人的不安。",
        choices: [
            {
                text: "把記下的夢境拿給她看，讓她慢慢確認",
                affection: 2,
                trust: 4,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_childhood_memory")) {
                        return "你拿出手機，讓柳如煙看自己記下的夢境。她讀得很慢，尤其在「把重要的事情留下來」那句話停留了很久。「我記得……以前好像真的有人這樣跟我說過。」她翻開自己的筆記，把兩段記憶並排寫下來，卻沒有急著說它們完全相同。「有幾個地方很像，但我不想只因為希望是你，就認定你就是那個人。」她抬起頭，認真地說：「我們再找一點能確認的證據，好不好？」";
                    }

                    return "你試著把昨晚的夢境說給她聽。柳如煙安靜地聽完，說自己也有類似的記憶，但細節還不夠清楚。她沒有否定你的感覺，只提醒你們，夢境有時會把不同的記憶混在一起。你們決定把目前能確定的內容分開記錄，之後再慢慢核對。";
                },
                special: "shared_childhood_memory",
                flag: "shared_childhood_memory"
            },
            {
                text: "先問她是否也記得那個女孩曾經說過的話",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recalled_first_promise")) {
                        return "柳如煙低頭思考了一會兒，終於說：「我記得自己好像問過一個人，如果有一天我們走散了，還能不能再見面。」她停頓片刻，接著搖頭。「但你剛才說的那句話，我沒辦法確定是不是原本的內容。」她沒有把希望完全寄託在模糊的回憶上，而是決定繼續尋找當年留下的實物紀錄。";
                    }

                    return "柳如煙努力回想，卻只能記得自己曾經問過一個人，長大以後還會不會再見面。至於對方究竟怎麼回答，她仍然想不起來。「也許我們真的在找同一件事，也可能只是有相似的回憶。」她說。你們決定先不急著下結論。";
                },
                special: "asked_about_shared_words",
                flag: "asked_about_shared_words"
            }
        ]
    },
    // ==============================
    // 第 47 幕：名冊上的空白
    // ==============================
    // 第 47 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "隔天下午，你和柳如煙再次來到活動中心。老先生答應讓你們查閱保存下來的活動資料，但提醒你們，有些紀錄已經遺失或受損。",
        choices: []
    },
    // 第 47 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "你們先從星空活動舉辦的年份開始找，翻過幾本名冊後，終於找到一份參加者登記表。上面有許多孩子的名字，其中幾個字跡已經模糊。",
        choices: []
    },
    // 第 47 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙一頁頁看過去，原本期待的神情逐漸變得緊張。直到最後一頁，她忽然停下來。",
        choices: []
    },
    // 第 47 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "那裡有兩個名字被墨水暈開，只能辨認出部分筆畫，旁邊還有一個小小的星星符號。",
        choices: []
    },
    // 第 47 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "她盯著那兩行字，低聲說：「如果能看清楚這兩個名字，也許就能知道當年到底是誰參加了活動。」",
        choices: [
            {
                text: "用之前記下的活動日期，核對最可能的名冊",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_event_date")) {
                        return "你拿出先前記下的活動日期，與名冊封面和登記表逐一比對。日期大致吻合，讓你們確認這確實是值得調查的那場活動。不過，兩個名字仍然模糊，無法直接辨認。柳如煙把這頁的編號記下，並請老先生確認是否還有其他副本。「我們終於找到對的紀錄了。」她說，「接下來要找的，是能讓名字重新清楚起來的證據。」";
                    }

                    return "你們比對了名冊的年份和活動內容，找到幾份可能相關的紀錄。柳如煙將它們分別記下，卻發現目前還不能確定哪一份才是當年的名冊。你們決定先保留幾個可能的方向，再尋找其他資料交叉確認。";
                },
                special: "matched_attendance_record",
                flag: "matched_attendance_record"
            },
            {
                text: "詢問老先生，是否記得那兩個名字或星星記號",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("asked_about_children")) {
                        return "老先生看著那兩行模糊的字，努力回想後說：「名字我真的記不得了。不過，當年有些孩子會在名字旁畫記號，方便找到自己熟悉的人。」柳如煙立刻看向那顆星星。「所以這個記號不一定是名字的一部分？」老先生點頭，提醒她不要只靠圖案推斷身分。柳如煙將這項資訊記下，決定繼續尋找其他版本的名冊或活動照片。";
                    }

                    return "老先生仔細看過登記表，卻無法辨認那兩個名字。他只記得以前的孩子偶爾會在登記資料旁畫上自己的小記號。柳如煙聽完後，將星星符號的樣子畫進筆記，決定找找看其他紀錄裡是否也出現過相同圖案。";
                },
                special: "asked_about_names",
                flag: "asked_about_names"
            }
        ]
    },
    // ==============================
    // 第 48 幕：藍色記號的另一端
    // ==============================
    // 第 48 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "老先生離開檔案室前，忽然想起一件事。他從另一個櫃子取出一本薄薄的活動紀錄簿，封面沒有標題，只有一道褪色的藍線。",
        choices: []
    },
    // 第 48 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "「這本不是正式名冊，是以前的工作人員用來記錄活動用品的。」他說。你和柳如煙翻開紀錄簿，發現裡面畫著星圖、紙袋和幾種奇怪的符號。",
        choices: []
    },
    // 第 48 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "翻到其中一頁時，柳如煙立刻停了下來。紙上的藍色記號，竟然和你們在儲藏室紙袋上看見的形狀十分相似。",
        choices: []
    },
    // 第 48 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "旁邊還寫著一行小字：『北方星列，第三顆；物品已交還參加者。』柳如煙抬起頭，眼神裡第一次出現了明確的期待。",
        choices: []
    },
    // 第 48 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "「所以那個紙袋可能不是隨便留下來的……它和當年的活動紀錄有關。」",
        choices: [
            {
                text: "把紀錄簿的符號與紙袋記號仔細比對",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("examined_blue_mark") && storyFlags.has("identified_third_star")) {
                        return "你將兩處記號並排比對，發現藍線的轉折方向、旁邊的星點，以及指向第三顆星的細線都相當接近。這不只是外形相似，連標記的位置也能互相對應。柳如煙把兩張紀錄拍下來，輕聲說：「我們至少知道，紙袋上的提示確實指向那張星圖。」不過，這仍然無法證明當年是誰留下紙袋。";
                    }

                    if (storyFlags.has("examined_blue_mark")) {
                        return "你拿出先前拍下的紙袋記號，發現兩者都有一道向右彎折的藍線，但紀錄簿上的星點位置還需要進一步確認。柳如煙將頁碼記下，決定先弄清楚星圖上的方位，再判斷它們是否真的有關。";
                    }

                    return "你們先記錄下藍線的形狀和旁邊的文字。由於還沒仔細檢查紙袋上的記號，目前只能確定兩份資料都使用了藍色標記，還不能斷定它們來自同一個人。";
                },
                special: "matched_blue_mark",
                flag: "matched_blue_mark"
            },
            {
                text: "先讀完紀錄簿，找出物品交還的日期",
                affection: 2,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_event_date") || storyFlags.has("matched_attendance_record")) {
                        return "你從紀錄簿後面的幾頁找到一筆日期，與先前調查的活動時間相近。那一頁記載著幾件觀測用品已經交還，但領取者的姓名欄卻只剩下模糊的墨痕。柳如煙仔細看著日期，說：「至少我們可以確定，這些東西是在那次活動前後處理的。」她把日期抄進筆記，並決定尋找是否有其他文件記錄了物品的領取者。";
                    }

                    return "你們繼續翻閱，發現紀錄簿確實記載了用品交還的過程，但部分日期已經褪色，姓名欄也有損毀。柳如煙將可能的頁碼記下，打算先找到確切的活動日期，再回來核對。";
                },
                special: "checked_return_date",
                flag: "checked_return_date"
            }
        ]
    },
    // ==============================
    // 第 49 幕：沒有寄出的信，留下的地址
    // ==============================
    // 第 49 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "你們把紀錄簿交給老先生，希望他能認出其中的日期與記號。老先生翻到最後幾頁，忽然指著一行幾乎被紙張折痕遮住的文字。",
        choices: []
    },
    // 第 49 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "「這個……我好像有印象。」那行字提到，一名年紀很小的參加者曾留下信件，原本打算在活動結束後交給另一名孩子，最後卻沒有完成交接。",
        choices: []
    },
    // 第 49 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "旁邊還寫著：「若本人未來領取，暫存於舊資料室。」柳如煙的手指停在那行字上。",
        choices: []
    },
    // 第 49 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "她沉默了很久，才緩緩開口：「我小時候……好像真的寫過一封信。可是，我一直想不起來信裡寫了什麼。」",
        choices: []
    },
    // 第 49 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "老先生表示，舊資料室後來整理過好幾次，信件是否還在，必須親自找過才能知道。",
        choices: [
            {
                text: "請老先生一起確認舊資料室的保存紀錄",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("offered_letter_search_help") || storyFlags.has("checked_box_inventory")) {
                        return "老先生想起你們之前也查過物品保存紀錄，便從抽屜裡取出一份舊移交清單。清單上有一筆資料寫著「未交付紙件一份」，但後面的存放位置被重新編號覆蓋了。柳如煙看著那幾個字，呼吸微微一滯。「它可能真的還在這裡……只是我們還不知道被放到哪裡了。」老先生答應讓你們繼續追查移交清單。";
                    }

                    return "老先生答應幫忙尋找舊資料。他翻出幾份保存紀錄，卻沒有立刻找到信件的確切位置。柳如煙沒有失望，只把相關年份與文件編號仔細抄下來，準備逐一核對。";
                },
                special: "checked_letter_records",
                flag: "checked_letter_records"
            },
            {
                text: "問柳如煙，她是否記得信是寫給誰的",
                affection: 3,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("honored_promises") || storyFlags.has("recalled_first_promise")) {
                        return "柳如煙低頭想了很久，才說：「我不記得名字，也想不起他的臉。但我記得，寫那封信的時候，我很害怕有一天會找不到他。」她停了一下，聲音變得很輕：「所以我可能把我們的約定也寫進去了。」你沒有急著追問，只告訴她，就算記憶還沒恢復，也可以慢慢把留下來的線索拼起來。她看著你，輕輕點了點頭。";
                    }

                    return "柳如煙努力回想，卻只能記起自己曾經非常認真地寫過一封信。她不確定收信人的名字，也不記得信裡的內容，只隱約記得那封信和一個重要的約定有關。你決定先不逼她回想，改從保存紀錄尋找答案。";
                },
                special: "asked_letter_recipient",
                flag: "asked_letter_recipient"
            }
        ]
    },
    // ==============================
    // 第 50 幕：被改寫的編號
    // ==============================
    // 第 50 段（1/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "隔天，你們帶著舊移交清單回到資料室。老先生找來新的保存目錄，逐一核對過去的編號。",
        choices: []
    },
    // 第 50 段（2/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "原本標記為「未交付紙件一份」的項目，後來被移到了另一個分類，新的標籤只寫著「私人紀念物」。",
        choices: []
    },
    // 第 50 段（3/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "你們依照清單找到一只扁平的紙盒，盒面有一道褪色的藍線，角落則畫著一顆小星星。",
        choices: []
    },
    // 第 50 段（4/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙沒有立刻伸手，而是先看向老先生，確認這只盒子可以由他們在場查看。",
        choices: []
    },
    // 第 50 段（5/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "盒蓋打開後，裡面放著幾張舊照片、活動紀錄，以及一個被折得整整齊齊的信封。信封沒有郵票，收件人一欄空白，背面卻畫著一顆有著特殊長角的星星。",
        choices: []
    },
    // 第 50 段（6/6 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "normal",
        text: "柳如煙怔怔地望著它，像是快要想起什麼，卻又被最後一層模糊的記憶擋住。",
        choices: [
            {
                text: "先檢查信封背面的星星，與舊星圖比對",
                affection: 1,
                trust: 3,
                expression: "surprised",
                response: () => {
                    if (storyFlags.has("compared_box_star") || storyFlags.has("matched_blue_mark")) {
                        return "你把信封背面的星星和先前記錄的圖案放在一起比較。那個特別長的角再次出現，而星點的排列也與舊星圖有相似之處。柳如煙輕聲說：「這種畫法，我好像很熟悉……可是我還是不敢確定。」你們拍下信封與星圖的對照，沒有急著拆開信封，決定先確認它是否確實屬於當年那場活動。";
                    }

                    return "你們記錄了信封上的星星形狀，注意到其中一個角比其他角長得多。這個細節可能有意義，但沒有足夠的參照物，還不能判斷它代表誰。柳如煙提議先保存這個發現，再找出能夠比較的舊圖案。";
                },
                special: "examined_letter_star",
                flag: "examined_letter_star"
            },
            {
                text: "請老先生核對信封是否符合當年的保存紀錄",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("checked_letter_records") || storyFlags.has("checked_box_inventory")) {
                        return "老先生仔細核對信封的尺寸、紙張和盒內的移交紀錄，發現這個信封很可能就是當年未能交付的紙件之一。不過，紀錄沒有留下收件人的姓名，仍無法百分之百確認。他把相關頁碼和保存編號抄下來，表示之後可以繼續追查。柳如煙小心地將信封放回原位，眼神比之前堅定了許多：「至少，我們終於找到可以繼續追下去的東西了。」";
                    }

                    return "老先生檢查了盒子的保存標籤，認為信封確實有可能來自當年的活動，但缺少完整的移交紀錄，還不能確認它的身分。你們將盒號與信封外觀記錄下來，準備再找其他證據交叉核對。";
                },
                special: "verified_old_envelope",
                flag: "verified_old_envelope"
            }
        ]
    },
    // ==============================
    // 第 51 幕：沒有寄出的信
    // ==============================
    // 第 51 段（1/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "sad",
        text: "老先生確認保存紀錄後，柳如煙才小心地打開信封。裡面是一張泛黃的信紙，折痕已經很深，字跡卻仍然清楚。",
        choices: []
    },
    // 第 51 段（2/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "sad",
        text: "開頭沒有收件人的名字，只寫著：「如果有一天，我們真的走散了，希望你不要忘記那片星空。」",
        choices: []
    },
    // 第 51 段（3/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "sad",
        text: "柳如煙的手微微顫抖，繼續讀下去：「我們說好，長大以後要再回到第一次約定的地方，一起看北方的第三顆星。要是你忘記了，就看我畫的星星。那個角畫得比較長的，就是我留下的記號。」",
        choices: []
    },
    // 第 51 段（4/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "sad",
        text: "讀到這裡，她停了下來，眼眶泛紅。信紙的最後一段被水漬暈開，只剩下幾個模糊的字。她努力辨認，卻始終看不清楚。",
        choices: []
    },
    // 第 51 段（5/5 幕）
    {
        chapter: 3,
        title: "被遺忘的回憶",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "sad",
        text: "你看著那封信，心中浮現一種難以解釋的熟悉感，彷彿自己曾經也等待過這樣一封信。",
        choices: [
            {
                text: "陪她逐字整理信件，保留每個能辨認的線索",
                affection: 2,
                trust: 3,
                expression: "sad",
                response: () => {
                    if (storyFlags.has("examined_letter_star") && storyFlags.has("identified_third_star")) {
                        return "你們把信上的星星描述與舊星圖放在一起，確認信中所說的「北方第三顆星」與先前找到的標記相互呼應。柳如煙將能辨認的句子逐字抄下，並把模糊處標記起來。「這不是隨便寫下的願望，」她說，「寫信的人真的相信，我們有一天還能找到彼此。」你們決定保留原件，避免因為過度處理而破壞剩下的字跡。";
                    }

                    return "你們一起整理信件，將看得清楚的內容抄錄下來，無法辨認的地方則留白。柳如煙說，不能因為急著知道答案，就把猜測當成真正的記憶。你同意先保留這些文字，等找到更多證據再回來比對。";
                },
                special: "teamwork",
                flag: "organized_letter_together",
                clue: "mysterious_letter"
            },
            {
                text: "先問她讀到這些文字時，想起了什麼",
                affection: 3,
                trust: 2,
                expression: "sad",
                response: () => {
                    if (storyFlags.has("asked_letter_recipient") || storyFlags.has("recalled_first_promise")) {
                        return "柳如煙閉上眼睛，過了一會兒才說：「我想起自己曾經很怕……怕有一天再也找不到那個人。」她記得有人答應過會回來，卻仍然想不起對方的臉。她望著信紙上的長角星星，低聲說：「我一直在找他，可是我不知道，他是不是也在找我。」你沒有替她下結論，只告訴她，至少現在你們已經找到一段真實留下來的文字。";
                    }

                    return "柳如煙努力回想，腦海中只浮現一片夜空，以及有人站在樹下向她伸出手的模糊畫面。她還是看不清那個人的臉。她輕聲說：「我不想再靠猜的了。我想找到真正的答案。」你點頭，答應和她一起繼續查證。";
                },
                special: "recalled_letter_emotion",
                flag: "recalled_letter_emotion"
            }
        ]
    },
    // ==============================
    // 第 52 幕：那個熟悉的筆跡
    // ==============================
    // 第 52 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "thinking",
        text: "離開活動中心後，你和柳如煙回到學校。她把信件的影本放在桌上，反覆看著其中幾個字。",
        choices: []
    },
    // 第 52 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "thinking",
        text: "忽然，她指著「如果你忘記了，就看我畫的星星」這句話，說自己想起了一件事。",
        choices: []
    },
    // 第 52 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "thinking",
        text: "小時候，她曾經把畫星星的方法教給一個男孩，還笑他每次都把其中一個角畫得特別長。你下意識地拿出自己的舊筆記本，翻到以前隨手畫過的一頁。",
        choices: []
    },
    // 第 52 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "thinking",
        text: "那裡有一顆星星，其中一個角同樣比其他角長。柳如煙看見後，整個人愣住了。她沒有立刻說你就是那個男孩，只是將兩張圖並排放好，仔細比較線條。",
        choices: []
    },
    // 第 52 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "classroom_sunset",
        character: "柳如煙",
        expression: "thinking",
        text: "「這個畫法……真的很像。」她輕聲說。你也開始懷疑，自己反覆夢見的童年片段，或許並不只是夢。",
        choices: [
            {
                text: "把筆記本交給她，讓她仔細比較兩種畫法",
                affection: 2,
                trust: 3,
                expression: "surprised",
                response: () => {
                    if (storyFlags.has("examined_letter_star") && storyFlags.has("compared_box_star")) {
                        return "柳如煙把筆記本上的星星、鐵盒裡的圖案，以及信封背面的記號依序排好。三個圖案都有一個特別長的角，其他細節也有相似之處。她看了很久，最後卻搖了搖頭：「我不能只因為畫得像，就認定你是他。」她把筆記本還給你，眼神裡多了一份認真。「我想找到能證明這件事的記憶，而不是只靠希望。」";
                    }

                    return "柳如煙仔細看著筆記本上的星星，發現那個特別長的角確實很醒目，但目前能比較的圖案還不夠多。她將這頁拍下來，決定等找到更多舊紀錄後再做判斷。";
                },
                special: "compared_personal_star",
                flag: "compared_personal_star"
            },
            {
                text: "告訴她，你最近反覆夢見的童年片段",
                affection: 3,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_childhood_memory") && storyFlags.has("shared_childhood_memory")) {
                        return "你把夢裡那句「如果有一天我們忘記彼此了，怎麼辦？」再次說給她聽。柳如煙聽見後，眼神忽然變了。她說，自己曾經問過幾乎一模一樣的問題，而對方回答，要把重要的事情留下來，總有一天就能找到答案。她低頭看著信件，終於明白那段話為什麼讓自己如此熟悉。但她仍然無法確認夢裡的男孩是不是你。";
                    }

                    return "你告訴她，自己反覆夢見一個男孩和女孩在老樹下談論約定。柳如煙安靜地聽完，說其中一些細節與她記得的往事相似，但也可能只是部分重疊。她希望你們能繼續查找當年的紀錄，讓記憶和證據彼此印證。";
                },
                special: "connected_dream_to_letter",
                flag: "connected_dream_to_letter"
            }
        ]
    },
    // ==============================
    // 第 53 幕：樹下的最後一句話
    // ==============================
    // 第 53 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "thinking",
        text: "週末，你陪柳如煙回到那座老公園。老樹還在，只是枝葉比記憶中稀疏了許多。她站在樹下，閉上眼睛，試著回想當年和男孩分開前的情景。",
        choices: []
    },
    // 第 53 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "thinking",
        text: "起初只有模糊的笑聲，接著是雨水落在地面的聲音，以及一雙沾著泥土的鞋。",
        choices: []
    },
    // 第 53 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "thinking",
        text: "她忽然睜開眼睛，說自己想起了那天的一個細節：男孩離開之前，曾把一張折好的紙交給她，叮囑她不要急著打開，要等到自己真的找不到他時再看。",
        choices: []
    },
    // 第 53 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "thinking",
        text: "可是她的記憶到這裡便中斷了。她不知道那張紙究竟是信件，還是另一張寫著約定的紙條。",
        choices: []
    },
    // 第 53 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "thinking",
        text: "你看著老樹下的石椅，忽然覺得這個地方與夢境裡的景象重疊在一起。",
        choices: [
            {
                text: "陪她坐在石椅上，慢慢回想當天的情景",
                affection: 3,
                trust: 3,
                expression: "sad",
                response: () => {
                    if (storyFlags.has("listened_to_rain_together") && storyFlags.has("recalled_first_promise")) {
                        return "你們坐在石椅上，安靜地聽著風穿過樹葉的聲音。柳如煙漸漸想起，男孩當時曾說：「如果你以後想不起我的樣子，就先記住我們說好的事情。」她終於明白，自己一直記得的不是一張臉，而是一個承諾。她轉頭看向你，卻沒有急著把你和那個男孩畫上等號。「我還差最後一段記憶，」她說，「但我覺得，我們已經很接近了。」";
                    }

                    return "你沒有催促她，只陪她坐在樹下。柳如煙逐漸想起當天的天空、石椅的位置，以及男孩離開前的神情，卻仍然想不起他的臉。她說，自己或許需要找到當年留下的其他紀錄，才能把最後的片段接起來。";
                },
                special: "sat_under_old_tree",
                flag: "sat_under_old_tree"
            },
            {
                text: "沿著老樹周圍尋找，看看是否還有被留下的記號",
                affection: 1,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("searched_old_tree") || storyFlags.has("compared_box_star")) {
                        return "你們沿著樹根和石椅仔細查看，沒有破壞任何東西。柳如煙在石椅底部看見先前拍過的星星記號，旁邊還有一道很淺的刻痕，像是某個字的開頭，但已經無法辨認。她把照片放大，發現刻痕旁有一個小小的日期標記。這個日期或許能和活動名冊互相核對，成為確認當年經過的另一項證據。";
                    }

                    return "你們在老樹附近找了一會兒，沒有發現新的物品。柳如煙倒是注意到石椅底部有一道很淺的刻痕，於是拍下照片留作紀錄。她認為，在沒有更多證據之前，不應該把普通的刻痕當成確定的線索。";
                },
                special: "checked_tree_mark_again",
                flag: "checked_tree_mark_again"
            }
        ]
    },
    // ==============================
    // 第 54 幕：被遮住的名字
    // ==============================
    // 第 54 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "你和柳如煙帶著石椅上的日期照片，再次回到活動中心。老先生翻出當年的活動紀錄，逐一核對後，終於找到相近的日期。",
        choices: []
    },
    // 第 54 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "那一天確實有一場觀星活動，結束後還有兩名孩子留在公園附近。紀錄旁邊畫著一顆小星星，與你們找到的信封圖案十分相似。",
        choices: []
    },
    // 第 54 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "然而，登記表上的其中一個名字被水漬完全遮住，另一個名字也只剩下幾個難以辨認的筆畫。",
        choices: []
    },
    // 第 54 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "老先生說，當年有些資料曾被重新抄寫，原件可能還保存在另一個地方。柳如煙看著那片空白，沒有像以前那樣急著猜測。",
        choices: []
    },
    // 第 54 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "她輕聲說：「我們已經知道那一天真的發生過，也找到留下來的約定。現在只差能確認身分的證據。」",
        choices: [
            {
                text: "請老先生尋找當年的原始登記表",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("matched_attendance_record") || storyFlags.has("recorded_event_date")) {
                        return "老先生根據你們記下的日期與名冊編號，找到一份尚未整理完成的舊文件清單。清單顯示，部分原始登記表曾移交給另一個保存單位，但沒有記下確切的收件人。他答應幫忙查詢移交紀錄。柳如煙把這項發現寫進筆記，說：「我們不是毫無頭緒了。只要找到原件，也許就能看清那些名字。」";
                    }

                    return "老先生答應幫忙，但因為缺少確切的日期與編號，暫時無法縮小搜尋範圍。你們先將這次找到的活動日期和星星記號記錄下來，準備再核對一次舊名冊。";
                },
                special: "requested_original_roster",
                flag: "requested_original_roster"
            },
            {
                text: "先比較星星記號，確認幾份資料是否屬於同一場活動",
                affection: 1,
                trust: 3,
                expression: "thinking",
                response: () => {
                    if (storyFlags.has("examined_letter_star") && storyFlags.has("compared_box_star")) {
                        return "你把信封、鐵盒紙條、活動紀錄上的星星圖案依序排好。雖然每個圖案都有些不同，但那個特別長的角一再出現，旁邊的標記位置也有相似之處。老先生確認這幾份資料的保存年代相近，認為它們很可能與同一系列活動有關。不過，他提醒你們，圖案只能證明資料之間存在關聯，還不能單靠它認定某個人的身分。";
                    }

                    return "你們逐一記錄不同文件上的星星圖案，發現其中一些細節相似，但現有的比較資料還不夠完整。柳如煙決定先把照片整理好，等找到更多原始文件後再進一步確認。";
                },
                special: "compared_activity_symbols",
                flag: "compared_activity_symbols"
            }
        ]
    },
    // ==============================
    // 第 55 幕：移交紀錄的最後一站
    // ==============================
    // 第 55 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "幾天後，老先生終於查到一筆較完整的移交紀錄。當年的部分活動資料，在整理時被送往附近的地方文史資料室保存，其中就包含原始參加者名冊。",
        choices: []
    },
    // 第 55 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "你和柳如煙立刻記下地址，準備前往查詢。出發前，老先生又拿出一張舊工作便條。",
        choices: []
    },
    // 第 55 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "便條上寫著：「若有人回來尋找那一天，請先確認他是否知道星空的約定。」柳如煙看著這句話，神情變得複雜。",
        choices: []
    },
    // 第 55 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "她說，這不像一般的資料整理備註，更像是有人特別留下來的一句提醒。你讀著那行字，腦海裡忽然閃過夢境中男孩的聲音，彷彿他曾經說過相似的話。",
        choices: []
    },
    // 第 55 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_center_office",
        character: "老管理員",
        expression: "normal",
        text: "可是，你仍然無法確定那段記憶究竟從何而來。",
        choices: [
            {
                text: "詢問老先生，這張便條是誰留下的",
                affection: 2,
                trust: 3,
                expression: "thinking",
                response: () => {
                    if (storyFlags.has("requested_original_roster")) {
                        return "老先生仔細回想後說，這張便條是在整理原始名冊時發現的，當時沒有人能確認是誰寫的。他只記得寫字的人似乎很熟悉那場活動，特別在意有一天是否會有人回來尋找當年的約定。柳如煙將便條的筆跡拍下，決定日後和信件上的字跡比較，但她提醒你，字跡相似也不一定代表出自同一人。";
                    }

                    return "老先生說，便條是整理舊資料時偶然發現的，沒有署名，也沒有留下日期。他建議你們先找到原始名冊，再回頭確認便條的來歷。";
                },
                special: "investigated_roster_note",
                flag: "investigated_roster_note"
            },
            {
                text: "把便條上的話記下，直接前往文史資料室",
                affection: 3,
                trust: 2,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("honored_promises") || storyFlags.has("recalled_first_promise")) {
                        return "你把便條上的話抄進筆記，尤其圈起「星空的約定」幾個字。柳如煙看著你的筆記，輕聲說：「我們一直在找的，也許不只是一個名字，而是那個人為什麼要留下這些東西。」你們決定先找到原始名冊，讓真正的紀錄回答問題，而不是只靠自己的猜測。";
                    }

                    return "你將便條妥善收好，與柳如煙一起前往文史資料室。你們希望先找到完整的名冊，再判斷這張便條與當年的事件有什麼關係。";
                },
                special: "headed_to_history_archive",
                flag: "headed_to_history_archive"
            }
        ]
    },
    // ==============================
    // 第 56 幕：原始名冊上的名字
    // ==============================
    // 第 56 段（1/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "地方文史資料室比你想像中安靜，架上放滿了泛黃的文件與舊照片。工作人員依照你們提供的日期和移交編號，找出一冊保存完整度較高的原始名冊。",
        choices: []
    },
    // 第 56 段（2/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "柳如煙翻到星空活動那一頁，終於看見當年參加者的完整登記欄。",
        choices: []
    },
    // 第 56 段（3/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "那一天確實有兩名孩子在活動結束後留下，其中一人的名字旁畫著一顆星星，另一人則在備註欄留下了幾個字：「約定之地，日後再見。」",
        choices: []
    },
    // 第 56 段（4/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "然而，名字旁邊的紙張曾經被撕去一小角，最後一個字仍然看不清楚。你盯著那行字，心中湧起一股難以言喻的熟悉感。",
        choices: []
    },
    // 第 56 段（5/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "柳如煙沒有急著下結論，只把名冊上的內容逐字抄錄下來。",
        choices: []
    },
    // 第 56 段（6/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "她說：「我們終於找到原始紀錄了。只要再找到能補上缺角的資料，也許就能確認那個男孩是誰。」",
        choices: [
            {
                text: "核對名冊的備註，找出與童年約定相符的內容",
                affection: 2,
                trust: 3,
                expression: "thinking",
                response: () => {
                    if (storyFlags.has("recorded_childhood_memory") && storyFlags.has("recalled_first_promise")) {
                        return "你把夢境中記得的約定，與名冊上的備註逐字比對。兩者都提到日後重逢，也都與那片星空有關。柳如煙看著紀錄，想起自己曾經問過男孩：「如果我們忘記彼此了，怎麼辦？」這些相似之處讓你們更接近答案，但她仍提醒你，約定相同不代表身分就已經獲得證明。";
                    }

                    return "你們逐字抄下備註，發現它確實與尋找約定的方向相符，但目前還無法與自己的記憶完全對上。柳如煙將相關頁碼記下，準備繼續查找當年的其他文件。";
                },
                special: "matched_roster_promise",
                flag: "matched_roster_promise"
            },
            {
                text: "詢問工作人員，是否有名冊缺角的原始照片",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("requested_original_roster") || storyFlags.has("headed_to_history_archive")) {
                        return "工作人員查詢了數位化資料，找到一張當年整理名冊時拍攝的照片。照片中的紙張還沒有被撕去一角，但影像解析度有限，最後一個字依舊模糊。你們將照片與現在的名冊並排保存，確認缺角是在後來整理時才出現的。工作人員表示，或許還有其他活動照片能補足這項資訊。";
                    }

                    return "工作人員表示，資料室曾經拍攝過部分舊文件，但需要更精確的年份與活動編號才能找到。你們先記下目前的名冊資料，準備再核對其他線索。";
                },
                special: "found_roster_scan",
                flag: "found_roster_scan"
            }
        ]
    },
    // ==============================
    // 第 57 幕：照片裡的第二個人
    // ==============================
    // 第 57 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "工作人員帶你們到另一排資料櫃，找出當年星空活動的照片集。照片裡有許多孩子站在觀測台旁，有人拿著星圖，有人正對著鏡頭笑。",
        choices: []
    },
    // 第 57 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "翻到最後幾張時，你們看見兩個孩子站在老樹下，其中一個女孩手裡拿著一張折好的紙，另一個男孩則低頭看著她畫的星星。",
        choices: []
    },
    // 第 57 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "照片背面寫著活動日期，旁邊還有一行小字：「兩位參加者，活動結束後自行離開。」柳如煙望著照片，呼吸變得急促。",
        choices: []
    },
    // 第 57 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "女孩的身形和她記憶中的自己十分相似，而男孩的臉卻被照片上的一道刮痕遮住。你盯著男孩的手，忽然注意到他正在無意識地輕敲手指。",
        choices: []
    },
    // 第 57 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "那個動作，竟然和你思考時的習慣一模一樣。",
        choices: [
            {
                text: "把男孩的手部動作與自己的習慣仔細比較",
                affection: 2,
                trust: 3,
                expression: "thinking",
                response: () => {
                    if (storyFlags.has("noticed_finger_tapping") || storyFlags.has("connected_tapping_memory")) {
                        return "你看著照片裡男孩的手指，想起自己思考時也總會做出相同的動作。柳如煙說，她記得那個男孩確實有這個習慣，而且每當他不知道該怎麼回答時，手指就會輕輕敲動。這項相似之處讓你們都沉默了。她最後說：「這是很重要的線索，但我還想找到更多能證明身分的東西。」";
                    }

                    return "你仔細觀察照片，發現男孩的手指確實有輕敲的姿勢，但單憑一張舊照片，還不能判斷這是否就是你的習慣。你把照片的細節記錄下來，決定再尋找其他能相互印證的證據。";
                },
                special: "compared_tapping_in_photo",
                flag: "compared_tapping_in_photo"
            },
            {
                text: "把照片交給柳如煙，請她說說女孩的記憶",
                affection: 3,
                trust: 3,
                expression: "sad",
                response: () => {
                    if (storyFlags.has("recalled_first_promise") || storyFlags.has("recalled_childhood_voice")) {
                        return "柳如煙仔細看著照片，終於想起女孩手裡拿著的紙。她說，那天男孩把紙交給她時，曾提醒她要記住星星的畫法。她還記得自己問過：「如果有一天我們真的認不出彼此呢？」男孩沒有回答名字，只說：「那就把我們留下的事情一件件找回來。」柳如煙抬頭看向你，眼神裡既有期待，也有不安。";
                    }

                    return "柳如煙努力回想女孩當時的心情，只記得自己似乎非常珍惜手中的紙。她仍然無法看清男孩的臉，但照片讓她確信，那一天確實是自己記憶中的重要時刻。她決定繼續找尋其他資料，不讓猜測取代真正的答案。";
                },
                special: "recalled_photo_moment",
                flag: "recalled_photo_moment"
            }
        ]
    },
    // ==============================
    // 第 58 幕：被折起來的另一半
    // ==============================
    // 第 58 段（1/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "thinking",
        text: "你們向工作人員詢問照片中那張折紙的下落。對方查閱了活動物品的保存紀錄，找到一份當年拍攝的物品清單。",
        choices: []
    },
    // 第 58 段（2/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "thinking",
        text: "清單裡記載，活動結束後曾留下兩份紙件：一封未寄出的信，以及一張寫著觀星約定的折紙。",
        choices: []
    },
    // 第 58 段（3/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "thinking",
        text: "信件後來被放進私人紀念物的紙盒，而折紙則被記錄為「交由參加者自行保管」。",
        choices: []
    },
    // 第 58 段（4/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "thinking",
        text: "柳如煙看著這段文字，忽然想起自己小時候確實把一張紙收得很仔細，卻不記得後來放在了哪裡。",
        choices: []
    },
    // 第 58 段（5/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "thinking",
        text: "你們繼續查看清單，發現折紙上曾寫著一句話：「如果忘記了，就從第一顆星開始找。」",
        choices: []
    },
    // 第 58 段（6/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "thinking",
        text: "柳如煙低聲重複這句話，彷彿那是一段已經遺失很久、卻一直留在心底的聲音。",
        choices: [
            {
                text: "把折紙上的句子與信件內容逐字比對",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("discovered_letter") || storyFlags.has("organized_letter_together") || storyFlags.has("verified_old_envelope")) {
                        return "你把折紙的紀錄與信件抄本放在一起，發現兩者都提到忘記彼此後，仍然能循著星星找到約定。信裡提到北方第三顆星，折紙卻說從第一顆星開始找。柳如煙想了想，認為這可能是尋找的順序，而不是兩個互相矛盾的提示。你們把這個差異記下，決定回到舊星圖，確認兩種說法如何連在一起。";
                    }

                    return "你們將折紙上的句子抄錄下來，發現它與信件所描述的約定十分相似，但目前還沒有完整的信件內容可以比較。柳如煙決定先保存這項紀錄，等確認信件後再找出兩者的關聯。";
                },
                special: "compared_paper_and_letter",
                flag: "compared_paper_and_letter"
            },
            {
                text: "追查折紙最後由誰保管，確認它是否還存在",
                affection: 1,
                trust: 3,
                expression: "thinking",
                response: () => {
                    if (storyFlags.has("found_roster_scan") || storyFlags.has("requested_original_roster")) {
                        return "工作人員依照物品清單的編號，找到一份後來補寫的備註：「紙件已由其中一位參加者帶離，未留存姓名。」這表示折紙很可能沒有被收進資料室，而是一直由某個人保管。柳如煙沉默了一會兒，說：「如果那張紙真的在我家裡，也許我只是忘了它放在哪裡。」你們決定先把這筆紀錄交給她，讓她回去尋找時有更明確的方向。";
                    }

                    return "工作人員確認，折紙當年被其中一位參加者帶走，但紀錄沒有留下姓名。柳如煙覺得自己或許曾經保管過它，卻無法確定。你們把編號與備註記下，準備繼續追查。";
                },
                special: "traced_folded_paper",
                flag: "traced_folded_paper"
            }
        ]
    },
    // ==============================
    // 第 59 幕：抽屜深處的折紙
    // ==============================
    // 第 59 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "ruyan_childhood_room",
        character: "柳如煙",
        expression: "surprised",
        text: "週末，柳如煙傳訊息告訴你，她在家裡找到了一個很久沒打開的木製抽屜。裡面放著童年的照片、褪色的貼紙，以及幾張被折得整整齊齊的紙。",
        choices: []
    },
    // 第 59 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "ruyan_childhood_room",
        character: "柳如煙",
        expression: "surprised",
        text: "她邀請你一起確認，因為她擔心自己會把記憶和想像混在一起。你來到她家後，她將其中一張紙慢慢攤開。",
        choices: []
    },
    // 第 59 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "ruyan_childhood_room",
        character: "柳如煙",
        expression: "surprised",
        text: "紙上畫著一片簡單的星空，北方的星列旁有一道藍色記號，角落還寫著：「如果忘記了，就從第一顆星開始找。」這正是你們在活動紀錄中讀到的句子。",
        choices: []
    },
    // 第 59 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "ruyan_childhood_room",
        character: "柳如煙",
        expression: "surprised",
        text: "紙張背面有一行稚嫩的字：「給長大以後的我們。」柳如煙看著那行字，眼神逐漸濕潤。她說，這張紙一直被自己留著，卻因為搬家而被遺忘在抽屜深處。",
        choices: []
    },
    // 第 59 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "ruyan_childhood_room",
        character: "柳如煙",
        expression: "surprised",
        text: "她終於明白，自己並沒有完全失去那段回憶，只是忘了該從哪裡開始尋找。",
        choices: [
            {
                text: "把折紙與信件的內容放在一起，重新整理約定",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("compared_paper_and_letter") && discoveredClues.has("mysterious_letter")) {
                        return "你們將折紙與信件抄本並排放好。信裡提到北方第三顆星，折紙則提示從第一顆星開始找。你們重新對照舊星圖，發現第一顆星是辨認方位的起點，第三顆星才是兩人約定要一起觀看的那顆。柳如煙終於理解，兩份紙件其實是在告訴未來的自己如何一步步找回約定。她把這個結果寫進筆記，並決定將兩份紙件妥善保存。";
                    }

                    return "你們將折紙上的文字仔細抄下，與目前找到的線索逐一比對。雖然還沒能完整解開兩份紙件的關係，但已經確認它們都指向同一個童年約定。柳如煙決定保留原件，等找到更多證據後再繼續整理。";
                },
                special: "reconstructed_promise",
                flag: "reconstructed_promise"
            },
            {
                text: "問她看到這張紙時，是否想起男孩的模樣",
                affection: 3,
                trust: 2,
                expression: "sad",
                response: () => {
                    if (storyFlags.has("recalled_photo_moment") || storyFlags.has("recalled_childhood_voice")) {
                        return "柳如煙望著折紙上的字，努力回想那天的情景。她想起男孩把紙交給她時，手指曾輕輕敲了幾下，然後笑著說：「如果忘記了，就把留下的事情找回來。」她仍然看不清他的臉，卻記得那個聲音帶著一點緊張，又很認真。她看向你，發現你思考時也會做出相似的手指動作。她沒有立刻說出自己的猜測，只輕聲問：「你真的不覺得這些事情很熟悉嗎？」";
                    }

                    return "柳如煙閉上眼睛，努力回想男孩的模樣，卻依然只能看見模糊的輪廓。她說，這張紙讓她確定自己曾經非常珍惜那個約定，但她不願意因為急著找到答案，就把任何相似的人認成他。";
                },
                special: "asked_about_folded_paper_memory",
                flag: "asked_about_folded_paper_memory"
            }
        ]
    },
    // ==============================
    // 第 60 幕：夢境裡的最後一塊拼圖
    // ==============================
    // 第 60 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "childhood_memory_rain",
        character: "柳如煙",
        expression: "thinking",
        text: "那天晚上，你又夢見了老樹與星空。這一次，夢境比以前清楚得多。年幼的男孩坐在石椅上，一邊聽著雨聲，一邊用手指輕敲膝蓋。",
        choices: []
    },
    // 第 60 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "childhood_memory_rain",
        character: "柳如煙",
        expression: "thinking",
        text: "女孩把畫好的星星遞給他，笑著說：「你每次想事情都會這樣敲手指，真的改不掉。」",
        choices: []
    },
    // 第 60 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "childhood_memory_rain",
        character: "柳如煙",
        expression: "thinking",
        text: "男孩不好意思地停下動作，接著拿出一張折紙，說要把兩人的約定留下來。女孩問他：「如果長大以後，我們真的認不出彼此呢？」",
        choices: []
    },
    // 第 60 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "childhood_memory_rain",
        character: "柳如煙",
        expression: "thinking",
        text: "男孩沉默片刻，才回答：「那就不要只看臉。記住我們說過的話，還有一起留下的東西。」就在女孩準備說出下一句話時，夢境突然中斷。",
        choices: []
    },
    // 第 60 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "bedroom",
        character: "柳如煙",
        expression: "thinking",
        text: "你醒來後，發現自己不自覺地敲著手指，心裡第一次浮現一個清晰的念頭：那個男孩可能就是自己。",
        choices: [
            {
                text: "把夢裡的每個細節寫下來，再與舊紀錄比對",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("recorded_childhood_memory") && storyFlags.has("compared_tapping_in_photo")) {
                        return "你將新夢境與之前記錄的片段放在一起，發現手指敲動的習慣、星星的畫法，以及男孩說過的約定，都能在舊照片和紙件中找到相似之處。這些線索彼此呼應，卻仍然缺少一個能確認身分的直接證據。你決定把夢境的日期和內容保存下來，避免日後因為情緒而記錯細節。";
                    }

                    return "你將夢境中的場景、對話和動作逐一記下。雖然它讓你感到非常熟悉，但夢境本身還不能證明那是真實的童年記憶。你決定先保留紀錄，再找其他證據核對。";
                },
                special: "documented_final_dream",
                flag: "documented_final_dream"
            },
            {
                text: "立刻聯絡柳如煙，告訴她夢裡想起的話",
                affection: 3,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("shared_childhood_memory") || storyFlags.has("connected_dream_to_letter")) {
                        return "你把夢裡那句「不要只看臉，要記住我們說過的話」告訴柳如煙。電話另一端安靜了很久，她才說，這句話和她從折紙、信件中找回的約定十分相似。她沒有急著確認你的身分，只問你是否還記得其他細節。你坦白自己仍然看不清男孩的臉，但這次的夢境比以前更完整。柳如煙輕聲說：「那我們就一起把最後的證據找出來。」";
                    }

                    return "柳如煙聽完你的描述後，表示其中幾個細節與她的記憶相似，但她不希望你們只靠夢境就認定結果。她答應隔天一起整理所有已經找到的資料，再決定下一步該查什麼。";
                },
                special: "shared_final_dream",
                flag: "shared_final_dream"
            }
        ]
    },
    // ==============================
    // 第 61 幕：所有線索的交會點
    // ==============================
    // 第 61 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "school_library_evening",
        character: "柳如煙",
        expression: "thinking",
        text: "放學後，你和柳如煙借了圖書館的一張桌子，把一路找到的資料全部攤開：舊照片、活動名冊、保存紀錄、信件抄本、折紙，以及星圖的照片。",
        choices: []
    },
    // 第 61 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "school_library_evening",
        character: "柳如煙",
        expression: "thinking",
        text: "你們先確認活動日期，再核對星星符號與藍色記號，接著將信件和折紙中的句子逐字比對。原本看似毫無關聯的細節，開始慢慢連成一條清楚的線。",
        choices: []
    },
    // 第 61 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "school_library_evening",
        character: "柳如煙",
        expression: "thinking",
        text: "第一顆星用來辨認方向，北方第三顆星才是兩人約定要一起觀看的目標；特殊的長角星星則是女孩留下的記號。",
        choices: []
    },
    // 第 61 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "school_library_evening",
        character: "柳如煙",
        expression: "thinking",
        text: "柳如煙望著桌面，終於說：「我以前一直以為，只要想起他的臉，就能找到他。可是我們真正找到的，是他留下來的每一件事情。」",
        choices: []
    },
    // 第 61 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "school_library_evening",
        character: "柳如煙",
        expression: "thinking",
        text: "她抬頭看向你，目光停留了片刻。「現在，我想知道的不是你像不像他，而是你還記不記得，那一天最後發生了什麼。」",
        choices: [
            {
                text: "依照日期、星圖與紙件順序，重新整理整段約定",
                affection: 2,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (
                        discoveredClues.has("old_photo") &&
                        discoveredClues.has("mysterious_letter") &&
                        storyFlags.has("compared_paper_and_letter") &&
                        storyFlags.has("reconstructed_promise")
                    ) {
                        return "你們按照時間順序整理資料：先是觀星活動，接著是老樹下的約定，再來是寫給未來彼此的信與折紙。信件中的北方第三顆星、折紙上的尋找順序，以及照片中的兩個孩子都能互相呼應。柳如煙確認，這些紀錄確實描述了同一段童年往事。她在筆記最後寫下：「約定的內容已經確認，接下來要確認的是，當年留下這些東西的人究竟是誰。」";
                    }

                    return "你們嘗試按照日期和物品出現的順序整理資料，但仍有幾個部分缺少證據。柳如煙把尚未確認的地方標記起來，提醒自己不能把推測當成答案。她決定先補齊缺少的線索，再繼續確認兩個孩子的身分。";
                },
                special: "teamwork",
                flag: "organized_all_evidence"
            },
            {
                text: "請柳如煙說出，她現在對你有什麼感覺",
                affection: 3,
                trust: 2,
                expression: "sad",
                response: () => {
                    if (storyFlags.has("shared_final_dream") || storyFlags.has("connected_dream_to_letter")) {
                        return "柳如煙沉默片刻，才緩緩說：「我不知道你是不是我一直在找的那個男孩，但我知道，這段時間你一直陪著我找答案。」她低頭看著信件，聲音很輕：「我曾經很害怕，如果有一天真的找到他，卻發現我們已經變成完全不同的人，那該怎麼辦。」她抬頭看向你：「所以我不想只因為過去的約定，就替現在的我們決定一切。我希望不管最後的答案是什麼，我們都能誠實面對。」";
                    }

                    return "柳如煙告訴你，她很珍惜你陪她尋找過去的這段時間，但她還無法確定你的夢境是否真實，也不想過早替你們的關係下定論。她希望先把當年的真相弄清楚，再認真面對接下來的事。";
                },
                special: "shared_present_feelings",
                flag: "shared_present_feelings"
            }
        ]
    },
    // ==============================
    // 第 62 幕：被遺漏的最後一頁
    // ==============================
    // 第 62 段（1/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "隔天，你和柳如煙再次來到文史資料室。工作人員告訴你們，原始名冊最後還有一頁當年沒有完成數位化，因此先前的資料一直缺少這部分。",
        choices: []
    },
    // 第 62 段（2/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "你們在工作人員陪同下找到那一頁，紙張邊緣雖然破損，卻保留著兩名孩子的登記資料。",
        choices: []
    },
    // 第 62 段（3/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "其中一欄寫著活動結束後的聯絡方式，另一欄則記錄了物品交還的情況。",
        choices: []
    },
    // 第 62 段（4/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "柳如煙仔細看著那頁資料，發現其中一名孩子的備註，與信件裡的約定內容完全相符；另一名孩子的備註，則寫著「已將星圖交給對方保管」。",
        choices: []
    },
    // 第 62 段（5/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "然而，姓名欄仍有一部分被污漬遮住。工作人員說，資料室還保存著當年活動的報名卡，或許能補上名冊缺失的字。",
        choices: []
    },
    // 第 62 段（6/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "surprised",
        text: "柳如煙握緊筆記本，低聲說：「我們真的快找到答案了。」",
        choices: [
            {
                text: "核對物品交還紀錄，確認星圖曾交給誰",
                affection: 2,
                trust: 3,
                expression: "thinking",
                response: () => {
                    if (storyFlags.has("checked_return_date") || storyFlags.has("traced_folded_paper")) {
                        return "你們把最新的名冊頁面與先前的物品交還紀錄並排比對，發現星圖交還的時間與信件保存紀錄相近。資料顯示，星圖是交給其中一名孩子保管，而不是留在活動中心。柳如煙回想自己家中的折紙，覺得它很可能就是當年被帶走的那份星圖，但她仍希望找到報名卡，確認當時的登記姓名。";
                    }

                    return "你們確認名冊記載了星圖交還的情況，但缺少先前的移交紀錄，還無法知道究竟由哪名孩子帶走。柳如煙將這頁資料拍照留存，決定先尋找報名卡來補足資訊。";
                },
                special: "verified_star_chart_transfer",
                flag: "verified_star_chart_transfer"
            },
            {
                text: "直接查找當年的原始報名卡",
                affection: 1,
                trust: 3,
                expression: "normal",
                response: () => {
                    if (storyFlags.has("found_roster_scan") || storyFlags.has("requested_original_roster")) {
                        return "工作人員依照原始名冊的編號，找到一疊尚未整理的報名卡。大部分卡片上的字跡已經褪色，但有兩張卡片的日期與活動紀錄一致。其中一張背面畫著一顆有著特殊長角的星星，另一張則寫著一句簡短的話：「長大以後，再一起看星星。」柳如煙看著兩張卡片，沒有立刻翻到正面，而是先請工作人員確認卡片的保存編號，避免把不同活動的資料混在一起。";
                    }

                    return "工作人員找出部分報名卡，但因為缺少完整的名冊編號，目前還不能確認哪些卡片屬於你們正在調查的活動。你們先記下可用的日期與標記，再繼續核對。";
                },
                special: "found_original_registration_cards",
                flag: "found_original_registration_cards"
            }
        ]
    },  
    // ==============================
    // 第 63 幕：逐漸清晰的名字
    // ==============================
    // 第 63 段（1/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "nervous",
        text: "工作人員將兩張報名卡放在桌上，先確認日期、活動編號與保存紀錄。三項資料全部吻合後，你們才小心地翻到正面。",
        choices: []
    },
    // 第 63 段（2/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "nervous",
        text: "第一張卡片上的姓名已經模糊，只能辨認出部分筆畫；第二張卡片的姓名則保存得比較完整，但旁邊沒有星星記號。",
        choices: []
    },
    // 第 63 段（3/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "nervous",
        text: "柳如煙看著那張畫著特殊星星的卡片，忽然皺起眉頭。「這個記號……我好像看過很多次。」",
        choices: []
    },
    // 第 63 段（4/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "nervous",
        text: "她從筆記本裡拿出信件的照片，再翻出折紙與鐵盒裡的紙條照片。三個記號的長角方向一致，連旁邊的小缺口也幾乎相同。",
        choices: []
    },
    // 第 63 段（5/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "nervous",
        text: "你們終於能確定，這些物品與那次活動有關。但工作人員提醒你們，星星只能證明物品之間的關聯，不能單靠圖案判定是誰畫的。",
        choices: []
    },
    // 第 63 段（6/6 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "local_history_archive",
        character: "柳如煙",
        expression: "nervous",
        text: "柳如煙點點頭，將報名卡上的姓名抄下來，卻沒有馬上告訴你。她看著你，像是在等你自己想起什麼。",
        choices: [
            {
                text: "先比對報名卡、信件與折紙上的日期",
                affection: 1,
                trust: 3,
                expression: "thinking",
                response: () => {
                    if (
                        storyFlags.has("found_original_registration_cards") &&
                        (storyFlags.has("recorded_event_date") || storyFlags.has("checked_return_date"))
                    ) {
                        return "你把報名卡日期與活動名冊、物品交還紀錄逐一比對，確認它們屬於同一場觀星活動。信件和折紙雖然沒有完整日期，但內容提到的約定地點與星圖記號，都能和這場活動的紀錄互相呼應。柳如煙輕聲說：「至少我們知道，這不是幾件剛好相似的東西，而是同一段往事留下來的證據。」";
                    }

                    return "你先把報名卡上的日期抄進筆記本，卻發現缺少一份完整的活動日期紀錄。柳如煙提醒你，現在還不能把所有資料直接連在一起。你們決定先保留這個發現，等找到足夠的日期證據再作判斷。";
                },
                special: "verified_registration_dates",
                flag: "verified_registration_dates"
            },
            {
                text: "請柳如煙告訴你，她認出了什麼",
                affection: 3,
                trust: 1,
                expression: "sad",
                response: () => {
                    if (storyFlags.has("compared_personal_star") || storyFlags.has("examined_letter_star")) {
                        return "柳如煙把三張星星圖案排在一起，指著那個特別長的角說：「我以前教過一個男孩這樣畫星星。他每次畫完，都會把其中一個角拉得很長，說這樣就算忘記了，也能認出來。」她停頓了一下。「可是我不敢只憑這個就認定是你。記得一個人的習慣，和真正知道他是誰，還是有差別的。」";
                    }

                    return "柳如煙說，這個星星記號讓她感到熟悉，卻還想不起完整的原因。她不願意因為一時的感覺就做出判斷，只是將圖案仔細收進筆記，準備與其他證據一起確認。";
                },
                special: "recognized_star_drawing",
                flag: "recognized_star_drawing"
            }
        ]
    },
    // ==============================
    // 第 64 幕：最初的約定
    // ==============================
    // 第 64 段（1/4 幕）
    {
        chapter: 4,
        title: "最初的約定",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "傍晚，你和柳如煙再次來到那棵老樹下。風吹過樹葉，發出熟悉的沙沙聲。柳如煙站在長椅旁，忽然伸手摸向椅背下方，像是想確認什麼。",
        choices: []
    },
    // 第 64 段（2/4 幕）
    {
        chapter: 4,
        title: "最初的約定",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "她愣了一下，接著蹲下身，從木板的縫隙裡取出一張早已泛黃的小卡片。卡片上畫著一顆星星，其中一個角特別長。她看了很久，眼眶漸漸泛紅。",
        choices: []
    },
    // 第 64 段（3/4 幕）
    {
        chapter: 4,
        title: "最初的約定",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "「我想起來了……那天分開以前，我把這張卡片交給了他。」她抬起頭看著你。",
        choices: []
    },
    // 第 64 段（4/4 幕）
    {
        chapter: 4,
        title: "最初的約定",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "「我跟他說，就算以後忘記了彼此，只要還記得這顆星星，就一定能找到回來的路。」你看著那熟悉的圖案，心底深處彷彿有什麼即將甦醒。",
        choices: [
            {
                text: "告訴她，自己也一直記得這顆星星",
                affection: 3,
                trust: 2,
                clue: "past_memory",
                expression: "surprised",
                response: () => {
                    storyFlags.add("shared_star_memory");
                    return "你說出這句話的瞬間，童年的畫面忽然變得清晰。小男孩站在樹下，將一張折好的卡片交給女孩，笑著說：「下次見面的時候，我們就一起看星星吧。」柳如煙怔怔地望著你，嘴唇微微顫抖，卻沒有立刻開口。";
                },
                flag: "shared_star_memory"
            },
            {
                text: "握住卡片，努力回想那天的情景",
                affection: 1,
                trust: 3,
                expression: "thinking",
                response: () => {
                    storyFlags.add("recalled_promise_scene");
                    return "你閉上眼睛，努力拼湊腦海裡的畫面。雨聲、樹影、女孩的笑聲，以及那句說過無數次的約定，終於不再只是模糊的片段。你想起那個男孩曾經答應過她，無論走多遠，都會回來一起看星空。";
                },
                flag: "recalled_promise_scene"
            }
        ]
    },
    // ==============================
    // 第 65 幕：你是不是那個人
    // ==============================
    // 第 65 段（1/5 幕）
    {
        chapter: 4,
        title: "你是不是那個人",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "柳如煙低頭看著手中的卡片，沉默了很久。忽然，她伸出手，輕輕敲了敲長椅，節奏和你思考時不自覺敲擊手指的習慣一模一樣。",
        choices: []
    },
    // 第 65 段（2/5 幕）
    {
        chapter: 4,
        title: "你是不是那個人",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "「我以前認識的那個男孩，也總是這樣。」她抬起頭，眼裡帶著期待，卻又害怕失望。",
        choices: []
    },
    // 第 65 段（3/5 幕）
    {
        chapter: 4,
        title: "你是不是那個人",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "「他喜歡下雨天，想事情的時候會敲手指，畫星星時還會把其中一個角畫得特別長……這些事情，你全都一樣。」她深吸一口氣。",
        choices: []
    },
    // 第 65 段（4/5 幕）
    {
        chapter: 4,
        title: "你是不是那個人",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "「我一直想找到他，可是我也害怕，真正找到的那一天，他已經不記得我了。」",
        choices: []
    },
    // 第 65 段（5/5 幕）
    {
        chapter: 4,
        title: "你是不是那個人",
        name: "旁白",
        background: "old_neighborhood_park",
        character: "柳如煙",
        expression: "sad",
        text: "你看著她，終於明白，這些日子以來你們尋找的答案，或許一直就在彼此身邊。",
        choices: [
            {
                text: "告訴她，自己也想起了那個約定",
                affection: 3,
                trust: 3,
                clue: "past_memory",
                expression: "surprised",
                response: () => {
                    storyFlags.add("admitted_childhood_connection");
                    if (
                        storyFlags.has("shared_star_memory") ||
                        storyFlags.has("recalled_promise_scene")
                    ) {
                        return "你點了點頭，告訴她自己已經想起了樹下的約定。柳如煙的眼淚終於落了下來，卻露出了久違的笑容。「原來是你……我真的找到你了。」她沒有急著追問所有細節，只是將那張卡片交到你手上。「這一次，我們不要再把約定弄丟了，好不好？」";
                    }
                    return "你坦白自己對那段記憶仍有些模糊，但你確實想知道真相，也不想讓她再獨自尋找。柳如煙看著你，輕輕點頭。「沒關係，我們可以慢慢想起來。但這一次，我希望你能陪我走到最後。」";
                },
                flag: "admitted_childhood_connection"
            },
            {
                text: "坦白自己還不能確定，但願意陪她找出真相",
                affection: 1,
                trust: 3,
                clue: "past_memory",
                expression: "thinking",
                response: () => {
                    storyFlags.add("honest_about_memory");
                    return "你沒有急著承認一段自己尚未完全想起的往事，只是告訴她，你願意一起面對真相。柳如煙沉默片刻，最後輕輕笑了。「謝謝你沒有為了安慰我而說謊。就算最後的答案和我想的不一樣，我也想親自確認。」她收好卡片，決定不再逃避那段記憶。";
                },
                flag: "honest_about_memory"
            }
        ]
    },
    // ==============================
    // 第 66 幕：那一天的真相
    // ==============================
    // 第 66 段（1/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "sad",
        text: "夜幕降臨，你和柳如煙坐在老樹下。她終於想起了分別那天的全部情景。當時，她的家人突然決定搬離這座城市，她甚至來不及好好道別。",
        choices: []
    },
    // 第 66 段（2/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "sad",
        text: "男孩把一封信交給她，答應等兩人長大後，一定會再回到這裡，一起看北方的第三顆星。可是那封信在搬家的途中遺失了。",
        choices: []
    },
    // 第 66 段（3/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "sad",
        text: "多年來，她只能靠著零碎的記憶尋找那個男孩，甚至漸漸忘記了他的長相。",
        choices: []
    },
    // 第 66 段（4/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "sad",
        text: "她轉頭看著你，輕聲說：「我以前一直以為，只要找到那張照片，就能找回所有記憶。現在我才明白，我真正想找回的，是那個曾經答應陪我看星星的人。」",
        choices: []
    },
    // 第 66 段（5/5 幕）
    {
        chapter: 4,
        title: "那一天的真相",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "sad",
        text: "你望著夜空，童年的約定終於不再只是夢境。至於你們能否重新走在一起，答案將由此刻的你決定。",
        choices: [
            {
                text: "告訴她：這次換我陪妳看完星空",
                affection: 3,
                trust: 2,
                expression: "happy",
                response: () => {
                    storyFlags.add("promised_to_stay");
                    if (
                        storyFlags.has("admitted_childhood_connection") ||
                        storyFlags.has("shared_star_memory") ||
                        storyFlags.has("recalled_promise_scene")
                    ) {
                        return "柳如煙看著你，終於露出安心的笑容。「那我們說好了，這次誰都不可以先離開。」她把卡片放在你們中間，抬頭望向星空。你知道，過去的記憶或許永遠無法完整復原，但你們還有機會一起創造新的回憶。";
                    }
                    return "柳如煙輕輕點頭。「謝謝你願意陪我。」她沒有要求你立刻想起所有往事，只是和你一起仰望夜空。對她而言，重要的不只是過去的那個男孩，也包括此刻願意陪在她身邊的你。";
                },
                flag: "promised_to_stay"
            },
            {
                text: "告訴她：我們不必急著替過去下定論",
                affection: 1,
                trust: 3,
                expression: "thinking",
                response: () => {
                    storyFlags.add("chose_truth_over_assumption");
                    return "你告訴她，過去的證據已經讓你們走到這裡，但你不想只因為幾個相似的習慣，就替彼此決定身分。柳如煙安靜地聽完，隨後點頭。「你說得對。比起急著得到答案，我更希望我們能誠實地面對彼此。」她把卡片收進口袋，兩人約好一起走完最後一段路。";
                },
                flag: "chose_truth_over_assumption"
            }
        ]
    },
    // ==============================
    // 第 67 幕：最後的選擇
    // ==============================
    // 第 67 段（1/5 幕）
    {
        chapter: 4,
        title: "最後的選擇",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "thinking",
        text: "夜空中的星星逐漸明亮。柳如煙轉過頭，認真地看著你。「以前的我，總覺得只要找到那個男孩，就能把失去的時間全部補回來。」",
        choices: []
    },
    // 第 67 段（2/5 幕）
    {
        chapter: 4,
        title: "最後的選擇",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "thinking",
        text: "她停了一下，露出淡淡的笑容。「可是現在，我不想再只活在回憶裡了。我想知道，站在我面前的你，究竟是怎麼想的。」",
        choices: []
    },
    // 第 67 段（3/5 幕）
    {
        chapter: 4,
        title: "最後的選擇",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "thinking",
        text: "她伸出手，掌心放著那張泛黃的星星卡片。",
        choices: []
    },
    // 第 67 段（4/5 幕）
    {
        chapter: 4,
        title: "最後的選擇",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "thinking",
        text: "「如果我們真的就是當年約定的兩個人，你願意和我一起走下去嗎？如果不是，我也希望我們能誠實地面對彼此。」",
        choices: []
    },
    // 第 67 段（5/5 幕）
    {
        chapter: 4,
        title: "最後的選擇",
        name: "旁白",
        background: "old_neighborhood_park_night",
        character: "柳如煙",
        expression: "thinking",
        text: "你看著她，知道這次不能再用模糊的答案帶過。過去已經有了答案的輪廓，現在該決定的，是你們的未來。",
        choices: [
            {
                text: "牽起她的手，約定一起創造新的回憶",
                affection: 3,
                trust: 2,
                expression: "happy",
                response: () => {
                    storyFlags.add("chose_future_together");
                    return "你牽起柳如煙的手，告訴她，不論過去的記憶是否完整，你都願意認真面對你們的未來。她先是一愣，隨後笑了。「那就說好了，這次我們一起走，不要再讓任何事情把我們分開。」她靠在你身旁，和你一起望向星空。";
                },
                flag: "chose_future_together"
            },
            {
                text: "告訴她，先給彼此時間，不急著決定關係",
                affection: 1,
                trust: 3,
                expression: "thinking",
                response: () => {
                    storyFlags.add("chose_slowly_together");
                    return "你坦白地告訴她，你很珍惜這段相遇，但希望兩人能在理解彼此之後，再決定未來。柳如煙安靜地聽著，最後點了點頭。「好啊。這一次，我們不必急著追上過去，就一步一步地往前走。」她把星星卡片交給你保管，兩人肩並肩地離開了老樹。";
                },
                flag: "chose_slowly_together"
            },
            {
                text: "坦白自己還無法確認過去，但願意珍惜現在",
                affection: 1,
                trust: 3,
                expression: "sad",
                response: () => {
                    storyFlags.add("chose_uncertain_truth");
                    return "你沒有假裝自己已經想起一切，而是把心裡的不確定全都告訴她。柳如煙沉默了片刻，眼中閃過一絲失落，卻還是點頭。「謝謝你願意說實話。至少現在，我們不用再猜測彼此的心意。」她收起卡片，與你一起走向回家的路。";
                },
                flag: "chose_uncertain_truth"
            }
        ]
    },
    // ==============================
    // 第 68 幕：心動的每一天
    // ==============================
    {
        chapter: 4,
        title: "心動的每一天",
        name: "旁白",
        background: "starry_sky_ending",
        character: "柳如煙",
        expression: "happy",

        text: `柳如煙望著星空，輕聲說：
    「你還記得我們小時候的約定嗎？」

    她轉頭看向你，紅著臉說：
    「其實，我喜歡你。那麼……你願意陪我走下去嗎？」`,

        choices: [
            {
                text: "牽起她的手，告訴她自己也喜歡她",
                affection: 3,
                trust: 3,
                special: "teamwork",
                expression: "love",
                response: function () {
                    return `你握住她的手。
    「我願意，因為我也喜歡妳。」

    柳如煙露出幸福的笑容。
    「那我們說好了，以後還要一起看星星喔。」`;
                }
            },
            {
                text: "抱住她，告訴她想和她慢慢走下去",
                affection: 1,
                trust: 3,
                expression: "happy",
                response: function () {
                    return `你輕輕抱住她。
    「我想和妳一起，慢慢創造更多回憶。」

    柳如煙輕輕點頭。
    「嗯，那我們就慢慢走下去。」`;
                }
            },
            {
                text: "坦白自己還需要時間整理心情",
                affection: 0,
                trust: 3,
                expression: "normal",
                response: function () {
                    return `你坦白說出自己的猶豫。
    「我很珍惜妳，但我還需要一點時間。」

    柳如煙有些失落，仍輕聲回答：
    「我明白了，謝謝你願意對我說實話。」`;
                }
            }
        ]
    }
];
// 舊版存檔（拆幕之前）的場景編號 → 現在對應的第一幕編號
const LEGACY_SCENE_START = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 19, 22, 23, 25, 26, 28, 30, 32, 35, 37, 40, 43, 46, 49, 53, 57, 60, 64, 68, 72, 75, 79, 84, 88, 93, 97, 101, 106, 111, 116, 122, 126, 131, 136, 141, 147, 152, 157, 162, 167, 172, 178, 183, 189, 194, 199, 204, 210, 216, 220, 225, 230, 235];

const totalScenes = storyScenes.length;
// ========================================
// 3. 關係與結局判定
// ========================================

function getRelationship() {
    if (affection >= 80) return "戀人";
    if (affection >= 60) return "曖昧中";
    if (affection >= 40) return "好朋友";
    if (affection >= 20) return "認識的同學";
    return "陌生人";
}

function getEnding() {
    // 隱藏結局優先
    if (hiddenEndingUnlocked) {
        return "隱藏結局";
    }

    // 是否做過重要的感情選擇
    // （這兩個是選項的 flag，記錄在 storyFlags，而不是 specialChoices）
    const madeKeyChoices =
        storyFlags.has("recalled_letter_emotion") &&
        storyFlags.has("shared_present_feelings");

    // 好結局：好感、信任與關鍵選擇都達標
    if (
        affection >= ENDING_RULES.goodAffection &&
        trust >= ENDING_RULES.goodTrust &&
        madeKeyChoices
    ) {
        return "好結局";
    }

    // 失敗結局：感情或信任不足
    if (
        affection < ENDING_RULES.badAffection ||
        trust < ENDING_RULES.badTrust
    ) {
        return "失敗結局";
    }

    // 其餘情況
    return "普通結局";
}

// ========================================
// 4. 好感度更新
// ========================================

function updateAffection() {
    const affectionElement = document.getElementById("affection");
    const levelElement = document.getElementById("affection-level");
    const fillElement = document.getElementById("affection-fill");

    if (!affectionElement || !levelElement || !fillElement) return;

    affectionElement.textContent =
        `好感度：${Math.round(affection)} / ${MAX_AFFECTION}`;

    levelElement.textContent = `關係：${getRelationship()}`;

    if (affection >= 80) {
        levelElement.style.color = "#ff70c5";
    } else if (affection >= 60) {
        levelElement.style.color = "#ff9bca";
    } else if (affection >= 40) {
        levelElement.style.color = "#70b7ff";
    } else if (affection >= 20) {
        levelElement.style.color = "#c4a1ff";
    } else {
        levelElement.style.color = "#aaaaaa";
    }

    fillElement.style.width = `${(affection / MAX_AFFECTION) * 100}%`;
}

// ========================================
// 5. 開始遊戲
// ========================================

// 重設所有遊戲資料（開始新遊戲、重開時共用，避免漏掉像 trust 這樣的變數）
function resetGameState() {
    affection = 0;
    trust = 0;
    dialogueStep = 0;
    currentSceneIndex = 0;
    hasChosen = false;
    pendingResponsePages = [];
    hiddenEndingUnlocked = false;
    specialChoices.clear();
    storyFlags.clear();
    discoveredClues.clear();
    solvedPuzzles.clear();

    relationshipStage = "normal";
    currentText = "";
    endingCgStep = 0;

    // 解謎狀態與視窗
    cancelPuzzleAnswer();
    closePuzzleModal();
    updatePuzzleStatus();

    hideToast();
}

function startGame() {
    const menu = document.getElementById("menu");
    const game = document.getElementById("game");
    const endingCg = document.getElementById("ending-cg");

    // 避免重複開始
    if (menu.classList.contains("menu-fade-out")) return;

    stopTyping();
    stopEndingTimer();

    // 開始播放背景音樂
    gameStarted = true;
    updateBgmVolume();
    bgm.play().catch(error => {
        console.warn("背景音樂播放失敗：", error);
    });

    // 重設遊戲資料
    resetGameState();

    endingCg.style.display = "none";
    endingCg.classList.remove("show-ending", "fade-out");

    // 先準備第一幕背景，避免顯示遊戲後才切換背景
    const firstScene = storyScenes[0];
    const background = document.getElementById("scene-background");

    if (background && firstScene.background) {
        const firstUrl = `url("${getBackgroundPath(firstScene.background)}")`;

        background.style.backgroundImage = firstUrl;
        background.dataset.currentBackground = firstUrl;
        background.dataset.sceneBackground = firstScene.background;
    }

    // 重設背景淡入狀態
    if (background) {
        background.classList.remove("background-fade-out");
    }

    // 主選單淡出
    menu.classList.add("menu-fade-out");

    setTimeout(() => {
        menu.style.display = "none";
        menu.classList.remove("menu-fade-out");

        // 遊戲畫面先以正常狀態顯示
        game.classList.remove("game-fade-in");
        game.style.display = "block";

        // 更新第一幕資料
        updateAffection();
        changeCharacter("normal");
        renderScene(0);

        // 強制瀏覽器完成畫面更新，再開始淡入
        void game.offsetWidth;
        game.classList.add("game-fade-in");

        setTimeout(() => {
            game.classList.remove("game-fade-in");
        }, 800);

    }, 800);
}

// ========================================
// 6. 顯示劇情
// ========================================

// 套用場景背景：同一張圖不重複切換，切換時先淡出再淡入
function applySceneBackground(name) {
    const background = document.getElementById("scene-background");

    // 先清掉上一次還沒執行完的背景切換，避免快速點擊時背景跳動
    clearTimeout(backgroundTimer);
    backgroundTimer = null;

    if (!background || !name) {
        return;
    }

    const targetBackground = `url("${getBackgroundPath(name)}")`;

    background.dataset.sceneBackground = name;

    if (background.dataset.currentBackground === targetBackground) {
        background.classList.remove("background-fade-out");
        return;
    }

    background.dataset.currentBackground = targetBackground;
    background.classList.add("background-fade-out");

    backgroundTimer = setTimeout(() => {
        backgroundTimer = null;
        background.style.backgroundImage = targetBackground;

        // 強制瀏覽器先套用新背景與透明度
        void background.offsetWidth;

        requestAnimationFrame(() => {
            background.classList.remove("background-fade-out");
        });
    }, 300);
}

// 圖片載入完成後，如果目前正顯示這個場景的替代背景，就換成正式圖片
function refreshBackgroundIfCurrent(name) {
    const background = document.getElementById("scene-background");

    if (background && background.dataset.sceneBackground === name) {
        applySceneBackground(name);
    }
}

function renderScene(index) {
    stopTyping();

    if (index >= storyScenes.length) {
        showEnding();
        return;
    }

    currentSceneIndex = index;
    dialogueStep = index;
    hasChosen = false;
    pendingResponsePages = [];

    const scene = storyScenes[index];

    // 1. 更新劇情背景（沒有圖片的場景會使用替代背景）
    applySceneBackground(scene.background);

    // 2. 更新角色名稱
    document.getElementById("character-name").textContent =
        scene.name;

    // 3. 更新劇情進度
    document.getElementById("scene-progress").textContent =
        `第 ${index + 1} / ${totalScenes} 段`;

    // 4. 隱藏選項
    document.getElementById("story-choices").style.display =
        "none";

    // 5. 顯示角色與劇情；文字全部顯示完之後才出現選項
    changeCharacter(scene.expression || "normal");
    showStoryChoices(scene.choices);

    // 沒有選項的幕：直接視為「已完成」，點擊即可進入下一幕
    if (!scene.choices || scene.choices.length === 0) {
        hasChosen = true;
    }

    typeDialogue(scene.text, revealStoryChoices);
}

// 劇情文字顯示完畢後，才讓玩家看到並點選選項
function revealStoryChoices() {
    if (hasChosen) return;

    const container = document.getElementById("story-choices");

    if (container && container.children.length > 0) {
        container.style.display = "block";
    }
}

// ========================================
// 7. 建立劇情選項
// ========================================

function showStoryChoices(choices) {
    const container = document.getElementById("story-choices");
    container.innerHTML = "";

    choices.forEach(choice => {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = choice.text;

        button.addEventListener("click", function () {
            // 選項只會在文字顯示完畢後才出現，這裡只需要防止重複點擊
            if (hasChosen) return;
            playClickSound();

            hasChosen = true;

            // 好感度與信任度依比例縮放，並限制在 0 ～ 上限之間
            affection = Math.max(
                0,
                Math.min(
                    MAX_AFFECTION,
                    affection + (choice.affection ?? 0) * AFFECTION_SCALE
                )
            );

            if (choice.special) {
                specialChoices.add(choice.special);
            }

            // 更新信任度
            trust = Math.max(
                0,
                Math.min(
                    MAX_TRUST,
                    trust + (choice.trust ?? 0) * TRUST_SCALE
                )
            );

            // 記錄這次選擇，供後續劇情判斷
            if (choice.flag) {
                storyFlags.add(choice.flag);
            }

            // 根據目前好感度更新關係狀態
            updateRelationshipStage();

            // 收集解謎線索
            if (choice.clue) {
                collectClue(choice.clue);
            }

            // 隱藏結局條件：必須收集線索、解開謎題，並做出正確選擇
            if (
                discoveredClues.has("old_photo") &&
                discoveredClues.has("mysterious_letter") &&
                discoveredClues.has("past_memory") &&
                solvedPuzzles.has("photo_date") &&
                solvedPuzzles.has("letter_secret") &&
                currentSceneIndex === totalScenes - 1 &&
                choice.special === "teamwork"
            ) {
                hiddenEndingUnlocked = true;
            }


            changeCharacter(choice.expression);

            document.getElementById("character-name").textContent = "柳如煙";

            // 點擊選項後，立即隱藏所有選擇按鈕
            container.style.display = "none";

            updateAffection();

            const responseText =
                typeof choice.response === "function"
                    ? choice.response()
                    : choice.response;

            // 回應文字太長時，分成數幕依序顯示
            const responsePages = splitDialogueText(responseText);

            pendingResponsePages = responsePages.slice(1);
            typeDialogue(responsePages[0] ?? responseText);
        });

        container.appendChild(button);
    });

    // 先保持隱藏，等劇情文字顯示完畢後再由 revealStoryChoices() 顯示
    container.style.display = "none";
}

// ========================================
// 8. 下一段劇情
// ========================================

function nextDialogue() {
    const dialogue = document.getElementById("dialogue");
    const endingCg = document.getElementById("ending-cg");
    const settings = document.getElementById("settings-overlay");

    // 結局或設定視窗開啟時，不處理一般劇情
    if (
        endingCg &&
        getComputedStyle(endingCg).display !== "none"
    ) {
        return;
    }

    if (
        settings &&
        getComputedStyle(settings).display !== "none"
    ) {
        return;
    }

    // 文字還在逐字顯示：立即顯示全文（同時讓選項出現）
    if (typingTimer !== null) {
        finishTyping();
        return;
    }

    // 尚未選擇回答，不進入下一段
    if (!hasChosen) {
        return;
    }

    // 選項回應還有後續幕：先顯示完
    if (pendingResponsePages.length > 0) {
        playClickSound();
        typeDialogue(pendingResponsePages.shift());
        return;
    }

    // 進入下一段
    renderScene(currentSceneIndex + 1);
}

// ========================================
// 9. 結局 CG
// ========================================

function showEndingCG(ending) {
    const cgImages = {
        "好結局": "images/cg_good.png",
        "普通結局": "images/cg_normal.png",
        "失敗結局": "images/cg_bad.png",
        "隱藏結局": "images/cg_hidden.png"
    };

    const cgTitles = {
        "好結局": "💕 好結局",
        "普通結局": "🌸 普通結局",
        "失敗結局": "🌧️ 失敗結局",
        "隱藏結局": "✨ 隱藏結局"
    };

    const cgDialogues = {
        "隱藏結局": "活動結束後，柳如煙拿出一本記著你們回憶的小筆記本。她看著你，輕聲問：「以後我們能不能不只是朋友？」",
        "好結局": "放學後，柳如煙在校門口叫住你。「我發現自己越來越期待每天見到你了。我想和你一起創造更多回憶。」",
        "普通結局": "柳如煙向你揮了揮手。「今天很開心，明天見！」你們成為了能自在聊天的朋友。",
        "失敗結局": "放學後，你和柳如煙簡單地道別。你們還沒有建立足夠的信任，也許下一次相遇能有不同的開始。"
    };

    stopEndingTimer();

    const cgArea = document.getElementById("ending-cg");
    const cgImage = document.getElementById("ending-cg-image");
    const cgDialogueBox = document.getElementById("ending-dialogue-box");

    endingCgStep = 0;
    currentEndingText = cgDialogues[ending] || "故事結束了。";

    cgImage.style.animation = "none";
    cgDialogueBox.style.animation = "none";

    cgImage.src = cgImages[ending];
    cgImage.alt = cgTitles[ending];

    document.getElementById("ending-cg-title").textContent =
        cgTitles[ending];

    document.getElementById("ending-cg-dialogue").textContent =
        "點擊畫面，揭開故事結局……";

    document.getElementById("ending-cg-hint").textContent =
        "點擊畫面繼續 ▶";

    cgArea.classList.remove("show-ending", "fade-out");
    cgArea.style.display = "block";

    // 重新觸發動畫
    void cgArea.offsetWidth;

    cgImage.style.animation = "";
    cgDialogueBox.style.animation = "";

    cgArea.classList.add("show-ending");
}

function advanceEndingCG() {
    const cgArea = document.getElementById("ending-cg");

    // 第一次點擊：顯示完整結局文字
    if (endingCgStep === 0) {
        document.getElementById("ending-cg-dialogue").textContent =
            currentEndingText;

        document.getElementById("ending-cg-hint").textContent =
            "再次點擊返回主選單 ▶";

        endingCgStep = 1;
        return;
    }

    // 防止連續點擊重複執行

    if (endingCgStep === 2) return;
    endingCgStep = 2;

    stopEndingTimer();

    const menu = document.getElementById("menu");

    // 先準備主選單，但保持透明
    menu.style.display = "flex";
    menu.style.visibility = "visible";
    menu.style.opacity = "0";

    menu.classList.remove("menu-return-animation");

    // 重新計算樣式，確保透明狀態生效
    void menu.offsetWidth;

    // CG 淡出與主選單漸入同步開始
    menu.classList.add("menu-return-animation");

    cgArea.classList.remove("show-ending");
    cgArea.classList.add("fade-out");

    endingTimer = setTimeout(() => {
        endingTimer = null;

        // 淡出完成後才隱藏 CG
        cgArea.style.display = "none";
        cgArea.classList.remove("fade-out");

        // 重設遊戲，但不要重新啟動主選單動畫
        restartGame(false);
    }, 1200);
}

function stopEndingTimer() {
    if (endingTimer !== null) {
        clearTimeout(endingTimer);
        endingTimer = null;
    }
}

// ========================================
// 10. 顯示結局
// ========================================

function showEnding() {
    stopTyping();

    hasChosen = true;

    document.getElementById("story-choices").style.display = "none";

    document.getElementById("scene-progress").textContent =
        `故事結束｜共 ${totalScenes} 段`;

    document.getElementById("character-name").textContent = "遊戲結局";

    showEndingCG(getEnding());
}

// ========================================
// 11. 重新開始
// ========================================

function restartGame(playMenuAnimation = true) {
    stopTyping();
    stopEndingTimer();

    // 清除尚未執行完的背景切換
    clearTimeout(backgroundTimer);
    backgroundTimer = null;

    // 重設所有遊戲資料（含 trust、解謎狀態與提示）
    resetGameState();

    const game = document.getElementById("game");
    const menu = document.getElementById("menu");
    const cgArea = document.getElementById("ending-cg");
    const choices = document.getElementById("story-choices");

    // 重設結局畫面
    cgArea.style.display = "none";
    cgArea.classList.remove("show-ending", "fade-out");

    // 隱藏遊戲畫面
    game.style.display = "none";

    // 先準備主選單
    menu.style.display = "flex";
    menu.style.visibility = "visible";
    menu.style.opacity = "1";

    // 重設主選單動畫
    if (playMenuAnimation) {
        menu.classList.remove("menu-return-animation");
        void menu.offsetWidth;
        menu.classList.add("menu-return-animation");
    }

    // 重設角色與劇情
    document.getElementById("character-name").textContent = "旁白";

    document.getElementById("dialogue").textContent =
        "你走進教室，發現一位陌生的女孩坐在窗邊。";

    choices.innerHTML = "";
    choices.style.display = "none";

    document.getElementById("scene-progress").textContent =
        `第 1 / ${totalScenes} 段`;

    updateAffection();
    changeCharacter("normal");

    // 動畫結束後移除類別，避免影響下次播放
    setTimeout(() => {
        menu.classList.remove("menu-return-animation");
    }, 1300);
}

// ========================================
// 12. 打字效果
// ========================================

// onDone：文字全部顯示完畢後要執行的動作（逐字顯示或直接顯示都會觸發）
// ========================================
// 長文字分頁：把一大段文字切成數幕，一次只顯示一小段
// ========================================
const DIALOGUE_PAGE_LENGTH = 62;

// 句子結尾（。！？…）且不在「」裡面時才斷開，並保留引號
function splitDialogueText(text, maxLen = DIALOGUE_PAGE_LENGTH) {
    const source = String(text).replace(/\n[ \t]+/g, "\n");
    const sentences = [];
    let buffer = "";
    let depth = 0;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];

        buffer += ch;

        if (ch === "「" || ch === "『") {
            depth++;
        } else if ((ch === "」" || ch === "』") && depth > 0) {
            depth--;
        }

        const endsSentence = /[。！？…]/.test(ch);
        const followedByCloser =
            next === "」" || next === "』" || /[。！？…]/.test(next || "");

        if (depth === 0 && endsSentence && !followedByCloser) {
            sentences.push(buffer);
            buffer = "";
        } else if (
            depth === 0 &&
            (ch === "」" || ch === "』") &&
            /[。！？…]/.test(source[i - 1] || "")
        ) {
            sentences.push(buffer);
            buffer = "";
        }
    }

    if (buffer.trim()) {
        sentences.push(buffer);
    }

    const pages = [];
    let current = "";

    sentences.forEach(sentence => {
        if (current && current.length + sentence.length > maxLen) {
            pages.push(current);
            current = sentence;
        } else {
            current += sentence;
        }
    });

    if (current) {
        pages.push(current);
    }

    // 最後一幕太短時，併回前一幕
    if (pages.length > 1 && pages[pages.length - 1].length < 14) {
        const last = pages.pop();
        pages[pages.length - 1] += last;
    }

    return pages;
}

// 選項回應還沒顯示完的後續幕（點擊後依序顯示）
let pendingResponsePages = [];

function typeDialogue(text, onDone = null) {
    // 清除上一段尚未完成的打字效果
    stopTyping();

    const dialogue = document.getElementById("dialogue");

    // 劇情資料裡有些多行字串帶有縮排空白，統一清掉每行開頭的空白
    currentText = String(text).replace(/\n[ \t]+/g, "\n");
    afterTyping = onDone;
    dialogue.textContent = "";

    // 重新播放文字淡入動畫
    dialogue.style.animation = "none";
    void dialogue.offsetWidth;
    dialogue.style.animation = "dialogueFadeIn 0.5s ease";

    // 關閉逐字效果時，直接顯示完整文字
    if (!gameSettings.typewriter || currentText.length === 0) {
        dialogue.textContent = currentText;
        runAfterTyping();
        return;
    }

    let index = 0;
    const interval = textSpeedMap[gameSettings.textSpeed] || 35;

    typingTimer = setInterval(() => {
        dialogue.textContent += currentText[index];
        index++;

        // 所有文字顯示完畢
        if (index >= currentText.length) {
            finishTyping();
        }
    }, interval);
}

// 文字顯示完畢後：更新螢幕閱讀器的朗讀區，並執行 onDone
function runAfterTyping() {
    const live = document.getElementById("sr-live");

    if (live) {
        live.textContent = currentText;
    }

    const callback = afterTyping;
    afterTyping = null;

    if (typeof callback === "function") {
        callback();
    }
}

/* 立即顯示完整對話 */
function finishTyping() {
    if (typingTimer === null) {
        return false;
    }

    clearInterval(typingTimer);
    typingTimer = null;

    const dialogue = document.getElementById("dialogue");
    dialogue.textContent = currentText;

    runAfterTyping();

    return true;
}

/* 停止逐字顯示（不會觸發 onDone，用於重設或切換場景） */
function stopTyping() {
    if (typingTimer !== null) {
        clearInterval(typingTimer);
        typingTimer = null;
    }

    afterTyping = null;
}

// ========================================
// 13. 切換女主角表情
// ========================================

// 已經有圖片的表情。新增圖片後，把名稱與路徑加在這裡即可。
const characterExpressions = {
    normal: "images/heroine.png",
    happy: "images/heroine_happy.png",
    angry: "images/heroine_angry.png",
    love: "images/heroine_love.png"
};

// 劇情中用到、但還沒有圖片的表情，先借用相近的表情
const expressionFallbacks = {
    sad: "normal",
    surprised: "normal",
    thinking: "normal",
    nervous: "normal"
};

let characterSwapTimer = null;

function changeCharacter(expression) {
    const characterImage = document.getElementById("character-image");

    // 找出實際要顯示的表情：自己的圖片 → 替代表情 → normal
    let resolved = expression || "normal";

    if (!characterExpressions[resolved]) {
        resolved = expressionFallbacks[resolved] || "normal";
    }

    const nextImage = characterExpressions[resolved] || characterExpressions.normal;

    // 如果圖片相同，就不重複切換
    if (characterImage.dataset.expression === resolved) {
        return;
    }

    characterImage.dataset.expression = resolved;

    // 先淡出舊表情
    characterImage.style.opacity = "0";

    clearTimeout(characterSwapTimer);
    characterSwapTimer = setTimeout(() => {
        characterSwapTimer = null;

        // 圖片載入失敗時，退回預設立繪，避免角色消失
        characterImage.onerror = () => {
            characterImage.onerror = null;

            if (!characterImage.src.endsWith(characterExpressions.normal)) {
                characterImage.src = characterExpressions.normal;
            }

            characterImage.style.opacity = "1";
        };

        // 等待新圖片載入後淡入
        characterImage.onload = () => {
            characterImage.style.opacity = "1";
            characterImage.onload = null;
        };

        characterImage.src = nextImage;

        if (characterImage.complete && characterImage.naturalWidth > 0) {
            characterImage.style.opacity = "1";
        }
    }, 180);
}

 // ========================================
 // 遊戲設定：讀取、儲存與套用
 // ========================================

function saveGameSettings() {
    try {
        localStorage.setItem(
            "heartEverydaySettings",
            JSON.stringify(gameSettings)
        );
    } catch (error) {
        console.warn("無法儲存遊戲設定。", error);
    }
}

function loadGameSettings() {
    try {
        const saved = localStorage.getItem("heartEverydaySettings");

        if (saved) {
            const parsed = JSON.parse(saved);

            if (parsed && typeof parsed === "object") {
                if (Number.isInteger(parsed.textSpeed)) {
                    gameSettings.textSpeed = Math.max(
                        1,
                        Math.min(5, parsed.textSpeed)
                    );
                }

                if (Number.isFinite(parsed.musicVolume)) {
                    gameSettings.musicVolume = Math.max(
                        0,
                        Math.min(100, parsed.musicVolume)
                    );
                }

                if (Number.isFinite(parsed.sfxVolume)) {
                    gameSettings.sfxVolume = Math.max(
                        0,
                        Math.min(100, parsed.sfxVolume)
                    );
                }

                if (typeof parsed.typewriter === "boolean") {
                    gameSettings.typewriter = parsed.typewriter;
                }
            }
        }
    } catch (error) {
        console.warn("讀取遊戲設定失敗，使用預設值。", error);
    }

    syncSettingsUI();
}

function syncSettingsUI() {
    const speed = document.getElementById("text-speed");
    const music = document.getElementById("music-volume");
    const sfx = document.getElementById("sfx-volume");
    const typewriter = document.getElementById("typewriter-toggle");

    if (!speed || !music || !sfx || !typewriter) return;

    speed.value = gameSettings.textSpeed;
    music.value = gameSettings.musicVolume;
    sfx.value = gameSettings.sfxVolume;
    typewriter.checked = gameSettings.typewriter;

    document.getElementById("text-speed-value").textContent =
        textSpeedLabels[gameSettings.textSpeed];

    document.getElementById("music-volume-value").textContent =
        `${gameSettings.musicVolume}%`;

    document.getElementById("sfx-volume-value").textContent =
        `${gameSettings.sfxVolume}%`;
}

function toggleSettings(show) {
    const overlay = document.getElementById("settings-overlay");

    if (!overlay) return;

    const shouldShow =
        typeof show === "boolean"
            ? show
            : overlay.style.display === "none";

    overlay.style.display = shouldShow ? "flex" : "none";

    if (shouldShow) {
        syncSettingsUI();

        document.getElementById("settings-close").focus();
    } else {
        const button = document.getElementById("settings-button");

        if (button) button.focus();
    }
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(error => {
            console.warn("退出全螢幕失敗。", error);
        });

        return;
    }

    if (!document.documentElement.requestFullscreen) {
        showToast("目前的瀏覽器不支援全螢幕功能。");
        return;
    }

    document.documentElement.requestFullscreen().catch(error => {
        console.warn("無法切換全螢幕。", error);
        showToast("無法開啟全螢幕，請確認瀏覽器是否允許。");
    });
}

// ========================================
// 設定介面事件
// ========================================

function initializeSettings() {
    const speed = document.getElementById("text-speed");
    const music = document.getElementById("music-volume");
    const sfx = document.getElementById("sfx-volume");
    const typewriter = document.getElementById("typewriter-toggle");
    const overlay = document.getElementById("settings-overlay");

    if (!speed || !music || !sfx || !typewriter || !overlay) return;
    // 為遊戲介面按鈕加入點擊音效
    document.querySelectorAll(
        "#game-toolbar button, #settings-overlay button"
    ).forEach(button => {
        button.addEventListener("click", playClickSound);
    });
    speed.addEventListener("input", () => {
        gameSettings.textSpeed = Number(speed.value);

        document.getElementById("text-speed-value").textContent =
            textSpeedLabels[gameSettings.textSpeed];

        saveGameSettings();
    });

    music.addEventListener("input", () => {
        gameSettings.musicVolume = Number(music.value);

        document.getElementById("music-volume-value").textContent =
            `${gameSettings.musicVolume}%`;

        updateBgmVolume();
        saveGameSettings();
    });

    sfx.addEventListener("input", () => {
        gameSettings.sfxVolume = Number(sfx.value);

        document.getElementById("sfx-volume-value").textContent =
            `${gameSettings.sfxVolume}%`;

        saveGameSettings();
    });

    typewriter.addEventListener("change", () => {
        gameSettings.typewriter = typewriter.checked;

        saveGameSettings();

        // 若目前正在顯示文字，立即套用新設定（並讓選項出現）
        if (typingTimer !== null && !gameSettings.typewriter) {
            finishTyping();
        }
    });

    // 點擊設定視窗外部關閉
    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            toggleSettings(false);
        }
    });

    // 按 Escape 關閉設定或解謎視窗
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        if (overlay.style.display !== "none") {
            toggleSettings(false);
            return;
        }

        const puzzleModal = document.getElementById("puzzle-modal");

        if (puzzleModal && puzzleModal.style.display === "flex") {
            closePuzzleModal();
        }
    });

    loadGameSettings();

    // 一開始就套用儲存的音樂音量（原本只有拖動滑桿時才會套用）
    updateBgmVolume();
}

// HTML 在 script.js 前面，因此可以直接初始化
initializeSettings();

const gameScreen = document.getElementById("game");

gameScreen.addEventListener("click", function (event) {
    // 點擊工具列、選項、設定或結局畫面時不推進
    if (event.target.closest(
        "#game-toolbar, #story-choices, #settings-overlay, #ending-cg"
    )) {
        return;
    }

    // 只有點擊遊戲主畫面才推進
    nextDialogue();
});

const SAVE_KEY = "heartDaysSave";
const SAVE_VERSION = 3;   // 3：劇情拆成多幕，場景編號與舊版不同
const LEGACY_SCENE_COUNT = LEGACY_SCENE_START.length;

function saveGame() {
    // 已經做出選擇（好感度已加上去）時，存成「下一幕開頭」，
    // 否則讀檔後會再選一次，同一個選項的數值會重複計算。
    // 沒有選項的幕沒有數值變化，存成「目前這一幕」，讀檔後可以重看一次。
    const currentHasChoices =
        Boolean(storyScenes[currentSceneIndex]?.choices?.length);
    const saveIndex =
        hasChosen && currentHasChoices ? currentSceneIndex + 1 : currentSceneIndex;

    if (saveIndex < 0 || saveIndex >= storyScenes.length) {
        showToast("最後一幕選擇之後就是結局，無法存檔。");
        return;
    }

    const saveData = {
        version: SAVE_VERSION,
        affection: affection,
        trust: trust,
        dialogueStep: saveIndex,
        currentSceneIndex: saveIndex,
        hiddenEndingUnlocked: hiddenEndingUnlocked,
        specialChoices: Array.from(specialChoices),
        discoveredClues: Array.from(discoveredClues),
        solvedPuzzles: Array.from(solvedPuzzles),
        storyFlags: Array.from(storyFlags),
        relationshipStage: relationshipStage,
        savedAt: new Date().toLocaleString("zh-TW")
    };

    let hasExistingSave = false;

    try {
        hasExistingSave = localStorage.getItem(SAVE_KEY) !== null;
    } catch (error) {
        console.error("檢查存檔失敗：", error);
    }

    // 如果已經有存檔，用遊戲內視窗詢問是否覆蓋（不使用瀏覽器內建的 confirm）
    if (hasExistingSave) {
        showConfirmDialog(
            "已經有一份存檔，確定要覆蓋嗎？",
            () => writeSaveData(saveData)
        );
        return;
    }

    writeSaveData(saveData);
}

function writeSaveData(saveData) {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    } catch (error) {
        console.error("存檔失敗：", error);
        showToast("無法存檔，請確認瀏覽器允許儲存資料（不是無痕模式）。");
        return;
    }

    updateSaveStatus();
    showToast("遊戲進度已保存！");
}

// ========================================
// 遊戲內確認視窗
// ========================================
let confirmCallback = null;

function showConfirmDialog(message, onConfirm) {
    const overlay = document.getElementById("confirm-overlay");
    const text = document.getElementById("confirm-message");

    if (!overlay || !text) {
        // 找不到視窗時，直接執行，避免功能卡住
        onConfirm();
        return;
    }

    confirmCallback = onConfirm;
    text.textContent = message;
    overlay.style.display = "flex";

    const okButton = document.getElementById("confirm-ok");

    if (okButton) {
        okButton.focus();
    }
}

function closeConfirmDialog(accepted) {
    const overlay = document.getElementById("confirm-overlay");
    const callback = confirmCallback;

    confirmCallback = null;

    if (overlay) {
        overlay.style.display = "none";
    }

    if (accepted && typeof callback === "function") {
        callback();
    }
}

document.addEventListener("keydown", event => {
    const overlay = document.getElementById("confirm-overlay");

    if (
        event.key === "Escape" &&
        overlay &&
        overlay.style.display === "flex"
    ) {
        closeConfirmDialog(false);
    }
});


function loadGame() {
    let savedData = null;

    try {
        savedData = localStorage.getItem(SAVE_KEY);
    } catch (error) {
        console.error("讀取存檔失敗：", error);
    }

    if (!savedData) {
        showToast("目前沒有保存的遊戲進度！");
        return;
    }

    try {
        const saveData = JSON.parse(savedData);
        const version = saveData.version ?? 1;

        if (version < 1 || version > SAVE_VERSION) {
            showToast("這份存檔的版本不相容，請使用相容版本的遊戲。");
            return;
        }

        // 檢查存檔資料是否完整
        if (
            typeof saveData.affection !== "number" ||
            typeof saveData.currentSceneIndex !== "number" ||
            !Array.isArray(saveData.specialChoices) ||
            saveData.currentSceneIndex < 0 ||
            saveData.currentSceneIndex >=
                (version < 3 ? LEGACY_SCENE_COUNT : storyScenes.length)
        ) {
            showToast("存檔資料格式錯誤，無法讀取！");
            return;
        }

        // 先重設，再套用存檔內容，避免殘留上一輪的狀態
        stopTyping();
        resetGameState();

        if (version === 1) {
            // 舊版存檔：好感度還沒縮放、也沒有記錄信任度，轉成目前的數值範圍
            affection = Math.max(
                0,
                Math.min(MAX_AFFECTION, saveData.affection * AFFECTION_SCALE)
            );
            trust = ENDING_RULES.badTrust;
        } else {
            affection = Math.max(
                0,
                Math.min(MAX_AFFECTION, saveData.affection)
            );

            trust = Math.max(
                0,
                Math.min(
                    MAX_TRUST,
                    typeof saveData.trust === "number" ? saveData.trust : 0
                )
            );
        }

        // v1、v2 存檔的場景編號是拆幕之前的，轉成對應的第一幕
        currentSceneIndex =
            version < 3
                ? LEGACY_SCENE_START[saveData.currentSceneIndex]
                : saveData.currentSceneIndex;
        dialogueStep = currentSceneIndex;
        hiddenEndingUnlocked =
            saveData.hiddenEndingUnlocked === true;
        specialChoices = new Set(saveData.specialChoices);

        // 恢復已收集的線索
        discoveredClues = new Set(
            Array.isArray(saveData.discoveredClues)
                ? saveData.discoveredClues.filter(
                    clueId => Object.prototype.hasOwnProperty.call(clueData, clueId)
                )
                : []
        );

        // 恢復已解開的謎題
        solvedPuzzles = new Set(
            Array.isArray(saveData.solvedPuzzles)
                ? saveData.solvedPuzzles.filter(
                    puzzleId => ["photo_date", "letter_secret", "childhood_promise"].includes(puzzleId)
                )
                : []
        );

        // 還原玩家的劇情選擇紀錄
        storyFlags = new Set(
            Array.isArray(saveData.storyFlags)
                ? saveData.storyFlags
                : []
        );

        // 還原角色關係狀態
        relationshipStage =
            saveData.relationshipStage || "normal";

        hasChosen = false;

        updatePuzzleStatus();
        updateAffection();
        renderScene(currentSceneIndex);
        updateSaveStatus();

        showToast(
            version === 1
                ? "舊版存檔已讀取並轉換為新的數值範圍。"
                : "存檔資料已讀取！"
        );
    } catch (error) {
        console.error("讀檔失敗：", error);
        showToast("存檔資料損壞，無法讀取！");
    }
}

function updateSaveStatus() {
    const status = document.getElementById("save-status");

    if (!status) return;

    let savedData = null;

    try {
        savedData = localStorage.getItem(SAVE_KEY);
    } catch (error) {
        status.textContent = "";
        return;
    }

    if (!savedData) {
        status.textContent = "尚未存檔";
        return;
    }

    try {
        const saveData = JSON.parse(savedData);

        if (saveData.savedAt) {
            status.textContent = "上次存檔：" + saveData.savedAt;
        } else {
            status.textContent = "已有存檔";
        }
    } catch (error) {
        status.textContent = "存檔資料異常";
    }
}

// 網頁載入後更新存檔狀態
updateSaveStatus();
