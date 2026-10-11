
"use strict";
// 背景音樂
const bgm = new Audio("audio/bgm.mp3");
bgm.loop = true;
// 按鈕點擊音效
function playClickSound() {
    const sound = new Audio("audio/click.mp3");
    sound.volume = gameSettings.sfxVolume / 100;
    sound.play().catch(error => {
        console.warn("按鈕音效播放失敗：", error);
    });
}

// 套用背景音樂音量
function updateBgmVolume() {
    bgm.volume = gameSettings.musicVolume / 100;
}

// ========================================
// 1. 遊戲變數
// ========================================

let affection = 0;
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
function getStoryText(normalText, variations = {}) {
    // 優先顯示專屬選擇的劇情
    for (const flag of storyFlags) {
        if (variations[flag]) {
            return variations[flag];
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
        description: "照片裡有兩個孩子，背面寫著一個未完成的約定。"
    },
    mysterious_letter: {
        name: "神祕信件",
        description: "一封沒有寄出的信，可能藏著約定的真正原因。"
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

    alert(
        "發現新線索！\n\n" +
        clueData[clueId].name +
        "\n" +
        clueData[clueId].description
    );
}

let currentPuzzle = null;

// 開始解謎：改用遊戲內的輸入區
function solvePuzzle(puzzleId, question, correctAnswer) {
    if (solvedPuzzles.has(puzzleId)) {
        alert("你已經解開這道謎題了！");
        updatePuzzleStatus();
        return;
    }

    currentPuzzle = {
        id: puzzleId,
        answer: correctAnswer
    };

    const title = document.getElementById("puzzle-question-title");
    const questionText = document.getElementById("puzzle-question-text");
    const answerInput = document.getElementById("puzzle-answer-input");
    const answerArea = document.getElementById("puzzle-answer-area");
    const feedback = document.getElementById("puzzle-feedback");

    if (!title || !questionText || !answerInput || !answerArea || !feedback) {
        alert("找不到解謎輸入區，請確認 index.html 已加入答案輸入區。");
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

    const answer = answerInput.value.trim();

    if (!answer) {
        feedback.textContent = "請先輸入答案。";
        feedback.style.color = "#ffcf8a";
        return;
    }

    if (answer === currentPuzzle.answer) {
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
        alert("你還沒有找到舊照片，無法解開這道謎題。");
        return;
    }

    solvePuzzle(
        "photo_date",
        "【舊照片之謎】\n\n照片背面的約定日期已經模糊不清。\n\n請輸入你推測的年份（西元四位數）：",
        "2015"
    );
}

function solveLetterPuzzle() {
    // 必須先找到神祕信件
    if (!discoveredClues.has("mysterious_letter")) {
        alert("你還沒有找到神祕信件，無法解開這道謎題。");
        return;
    }

    solvePuzzle(
        "letter_secret",
        "【神祕信件之謎】\n\n信件裡留下了一句話：\n「真正重要的，不是你記得多少，而是你是否願意再次尋找。」\n\n請輸入這句話的核心答案：",
        "尋找"
    );
}


// 顯示線索筆記本
function showClueNotebook() {
    const clues = Array.from(discoveredClues);

    if (clues.length === 0) {
        alert("目前還沒有找到任何線索。");
        return;
    }

    let message = "📖 線索筆記本\n\n";

    clues.forEach((clueId, index) => {
        const clue = clueData[clueId];

        if (clue) {
            message +=
                `${index + 1}. ${clue.name}\n` +
                `${clue.description}\n\n`;
        }
    });

    alert(message);
}

/* ==============================
   解謎視窗控制
============================== */

// 開啟解謎視窗
function openPuzzleModal() {
    const modal = document.getElementById("puzzle-modal");

    if (!modal) return;

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

const totalScenes = 21;
const MAX_AFFECTION = 100;

// ========================================
// 2. 劇情資料
// ========================================

const sceneBackgrounds = {
    classroom: "images/classroom.png",
    hallway: "images/hallway.png",
    school: "images/school.png",
    library: "images/library.png",
    rainy_school: "images/rainy_school.png",
    event_classroom: "images/event_classroom.png",
    playground: "images/playground.png",
};

const storyScenes = [
    // ==============================
    // 第一章：轉學生的秘密
    // ==============================

    // 第 1 段：初次相遇
    {
        name: "旁白",
        background: "classroom",
        text: "九月的早晨，陽光穿過教室的窗戶。班導帶著一名陌生的少女走進教室。她有著安靜的氣質，手裡抱著幾本課本。當她看向你時，腳步似乎停頓了一瞬，但很快又恢復平靜。",
        choices: [
            {
                text: "主動自我介紹，歡迎她加入班級",
                affection: 3,
                expression: "happy",
                response: "少女似乎沒料到你會主動開口。她輕輕點頭，露出淡淡的笑容。「你好，我叫柳如煙。以後請多多指教。」",
                special: "first_greeting"
            },
            {
                text: "注意到她剛才的停頓，詢問是不是有事",
                affection: 1,
                expression: "normal",
                response: "柳如煙微微一怔，隨即搖頭。「沒事，只是第一次來新環境，有點不習慣。」她把課本抱得更緊了一些。",
                special: "noticed_familiarity"
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
                expression: "normal",
                response: "「老師剛剛點名的時候有說呀。」柳如煙回答得很快，接著笑了笑。「你的名字還滿好記的。」",
                special: "asked_name"
            },
            {
                text: "先不追問，繼續整理自己的東西",
                affection: 1,
                expression: "normal",
                response: "你沒有追問。柳如煙偷偷看了你一眼，隨後拿起筆，在筆記本角落畫了一個小小的星星。",
                special: "observed_star"
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
                text: "把課本移到中間，和她一起看",
                affection: 4,
                expression: "happy",
                response: "「謝謝你。」柳如煙把椅子稍微移近。課堂中途，她忽然問你：「你平常放學後都做些什麼？」",
                special: "shared_textbook"
            },
            {
                text: "答應借她看，順便問她適不適應新學校",
                affection: 2,
                expression: "normal",
                response: "柳如煙笑著說：「目前還好，就是有些地方還不熟悉。」她看了看窗外，又補了一句：「希望能快點認識新朋友。」",
                special: "asked_transfer_reason"
            }
        ]
    },

    // 第 4 段：不熟悉的旋律
    {
        name: "旁白",
        background: "school",
        text: "下課後，你在走廊遇見柳如煙。她戴著耳機，輕輕哼著一段旋律。那旋律很簡單，聽起來有些懷舊。當她發現你站在旁邊，便停了下來。",
        choices: [
            {
                text: "詢問那是什麼歌",
                affection: 2,
                expression: "normal",
                response: "「是以前聽過的一段旋律，我也不知道歌名。」柳如煙摘下耳機。「有時候明明很久沒聽，卻還是會記得。」",
                special: "heard_melody"
            },
            {
                text: "開玩笑說她唱得還不錯",
                affection: 3,
                expression: "happy",
                response: "柳如煙愣了一下，隨後有些不好意思地笑了。「你不要突然稱讚我啦，我只是隨便哼哼而已。」",
                special: "remembered_melody"
            }
        ]
    },

    // 第 5 段：福利社的選擇
    {
        name: "柳如煙",
        background: "school",
        text: "午休時，你和柳如煙一起走到福利社。她在飲料櫃前看了一會兒，最後拿起一瓶包裝簡單的汽水。「這個味道還不錯。」她說。",
        choices: [
            {
                text: "買同款飲料，和她一起喝",
                affection: 3,
                expression: "happy",
                response: "柳如煙看著你手上的飲料，笑了起來。「你也喜歡這個嗎？那下次可以一起來買。」",
                special: "shared_drink"
            },
            {
                text: "推薦另一種飲料給她",
                affection: 2,
                expression: "normal",
                response: "柳如煙看了看你推薦的飲料，笑著搖頭。「下次再試試看吧，今天我還是想喝原本這個。」",
                special: "kept_preference"
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
                affection: 3,
                expression: "happy",
                response: "「謝謝你，明天我再還你。」柳如煙接過橡皮擦，認真地放在桌角，還特地用便利貼寫下你的名字。",
                special: "lent_eraser"
            },
            {
                text: "提醒她下次記得檢查文具",
                affection: 1,
                expression: "normal",
                response: "「知道了啦。」柳如煙小聲回答，接著忍不住笑了。「你講話怎麼跟老師一樣？」",
                special: "reminded_supplies"
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
                text: "先打招呼，再問她在找什麼",
                affection: 3,
                expression: "happy",
                response: "「我在找以前的校園活動紀錄。」柳如煙把書放回架上。「突然有點好奇以前的學校是什麼樣子。」",
                special: "library_search"
            },
            {
                text: "問她需不需要幫忙",
                affection: 2,
                expression: "normal",
                response: "「不用啦，我快找到了。」柳如煙笑著回答。她合上手中的校刊，卻又忍不住回頭看了一眼。",
                special: "noticed_year"
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
                affection: 4,
                expression: "happy",
                response: "「書店嗎？好像不錯。」柳如煙想了一下。「如果時間可以，我很想去看看。」",
                special: "invited_bookstore"
            },
            {
                text: "問她平常最喜歡做什麼",
                affection: 2,
                expression: "normal",
                response: "「看書、聽音樂，有時候也會出去散步。」她看向你。「那你呢？有沒有什麼特別喜歡的事情？」",
                special: "asked_hobbies"
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
                affection: 3,
                expression: "happy",
                response: "柳如煙點了點頭。「我也這麼覺得。有些習慣就算很久沒做，也不會真的消失。」",
                special: "believed_promise"
            },
            {
                text: "回答人長大後可能會改變",
                affection: 2,
                expression: "normal",
                response: "「也是。」柳如煙笑了笑。「所以偶爾回頭看看以前的自己，也滿有趣的。」",
                special: "questioned_promise"
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
                affection: 3,
                expression: "happy",
                response: "柳如煙接過傘，卻沒有立刻離開。「那你怎麼辦？」她看著你，最後提議等雨小一點再走。",
                special: "rain_memory"
            },
            {
                text: "提議一起撐傘到公車站",
                affection: 4,
                expression: "happy",
                response: "柳如煙愣了一下，隨後點頭。「好啊，那就麻煩你了。」兩人走進雨幕時，她輕輕哼起昨天那段旋律。",
                special: "shared_umbrella"
            }
        ]
    },

    // 第 11 段：奇怪的夢
    {
        name: "旁白",
        background: "classroom",
        text: "那天晚上，你做了一個奇怪的夢。夢裡是一座有大樹的校園，你似乎正和某個人說話。但夢裡的聲音模糊不清，醒來後，你只記得那是一個讓人安心的地方。",
        choices: [
            {
                text: "把夢裡的感覺記在手機備忘錄",
                affection: 1,
                expression: "normal",
                response: "你記下了夢裡的大樹和模糊的聲音。寫完後，你覺得這大概只是普通的夢，便沒有再多想。",
                special: "recorded_dream"
            },
            {
                text: "不再多想，準備隔天上課",
                affection: 2,
                expression: "normal",
                response: "你決定先把夢放在一邊。畢竟最近作業不少，也許只是太累了。",
                special: "recalled_voice"
            }
        ]
    },

    // 第 12 段：她知道的事情
    {
        name: "柳如煙",
        background: "classroom",
        text: "第二天早上，你到教室時，柳如煙已經坐在位置上。她看見你，忽然問：「你昨天睡得好嗎？」",
        choices: [
            {
                text: "告訴她自己做了一個奇怪的夢",
                affection: 3,
                expression: "normal",
                response: "柳如煙停下手中的動作。「夢嗎？」她很快恢復笑容。「我最近也常常做夢，大概是換了新環境的關係吧。」",
                special: "mentioned_star"
            },
            {
                text: "反問她為什麼突然問這個",
                affection: 2,
                expression: "normal",
                response: "「沒什麼，只是看你今天好像有點累。」柳如煙把早餐放到桌上。「記得吃早餐，不然上課會沒精神。」",
                special: "questioned_dream"
            }
        ]
    },

    // 第 13 段：校園裡的大樹
    {
        name: "旁白",
        background: "playground",
        text: "午休時，你經過操場旁的一棵老樹。柳如煙正站在樹下乘涼。微風吹過，她抬頭看著樹葉，神情難得放鬆。",
        choices: [
            {
                text: "走近詢問她為什麼喜歡這棵樹",
                affection: 3,
                expression: "normal",
                response: "「這裡很安靜。」柳如煙說。「有時候來這裡待一下，心情就會好很多。」",
                special: "old_tree"
            },
            {
                text: "不打擾她，只在旁邊安靜地陪著",
                affection: 4,
                expression: "happy",
                response: "你沒有追問，只在樹下陪她站了一會兒。柳如煙轉頭看著你，露出安心的笑容。「謝謝你，有時候安靜待著也很好。」",
                special: "quiet_company"
            }
        ]
    },

    // 第 14 段：臨時的邀請
    {
        name: "柳如煙",
        background: "playground",
        text: "放學後，柳如煙收拾好書包，走到你面前。「我想去附近的書店看看，你要一起去嗎？」她說完後，似乎有些在意你的回答。",
        choices: [
            {
                text: "答應和她一起去",
                affection: 4,
                expression: "happy",
                response: "「真的嗎？太好了。」柳如煙的笑容明顯變得燦爛。她和你約好時間，便先一步走向校門。",
                special: "accepted_invitation",
                flag: "accepted_invitation"
            },
            {
                text: "婉拒邀請，表示今天有事",
                affection: 0,
                expression: "normal",
                response: "柳如煙稍微愣了一下，隨後點頭。「沒關係，那下次有機會再一起去吧。」她雖然仍然微笑，卻沒有像剛才那麼雀躍。",
                special: "declined_invitation",
                flag: "declined_invitation"
            }
        ]
    },

    // 第 15 段：奇怪的巧合
    {
        name: "旁白",
        background: "classroom",
        text: "幾天後，你在整理課桌時，翻出一本自己很久以前用過的舊筆記本。裡面有幾頁字跡已經褪色，還畫著一些看不出意思的小圖案。你盯著其中一個星星圖案看了幾秒，卻想不起來是什麼時候畫的。這時，柳如煙剛好走進教室。",
        choices: [
            {
                text: "把筆記本拿給柳如煙看",
                affection: 3,
                expression: "normal",
                response: "柳如煙看著那個星星圖案，表情短暫地停頓了一下。「畫得滿可愛的。」她把筆記本還給你，沒有多問。",
                special: "showed_notebook"
            },
            {
                text: "把筆記本收好，問她今天的作業",
                affection: 2,
                expression: "happy",
                response: "柳如煙被你突然轉移話題的樣子逗笑了。「你也太實際了吧。」她拿出課本，開始和你討論作業。",
                special: "kept_notebook"
            }
        ]
    },

    // ==============================
    // 第二章：照片裡的陌生人
    // 正式謎題線索暫時不在這一章收集
    // ==============================

    // 第 16 段：整理教室
    {
        chapter: 2,
        title: "照片裡的陌生人",
        name: "旁白",
        background: "classroom",
        character: "柳如煙",
        expression: "normal",
        text: "學校準備整理一批舊教材，老師請幾位同學留下來幫忙。你和柳如煙負責整理教室後方的櫃子。翻找資料時，你們看到幾本年代久遠的校刊。柳如煙拿起其中一本，隨手翻了幾頁，又放回原處。",
        choices: [
            {
                text: "問她以前的校園生活是不是很有趣",
                affection: 2,
                expression: "happy",
                response: () => getStoryText(
                "「應該吧。」柳如煙笑著說。「每個人的學生時代都有一些值得記住的事。」她把校刊放回櫃子，轉頭問你以前最喜歡哪一堂課。",
                {
                    accepted_invitation: "柳如煙笑著靠近你。「昨天和你一起出去的話，應該會很有趣吧。」她拿起校刊，主動和你聊起以前的校園生活。",
                    declined_invitation: "柳如煙把校刊放回櫃子，禮貌地笑了笑。「以前的校園生活應該很有趣吧。」她沒有多聊昨天的邀請，而是繼續整理手上的教材。"
                }
            ),
                special: "asked_about_school_days"
            },
            {
                text: "專心整理教材，不多問其他事情",
                affection: 1,
                expression: "normal",
                response: "你繼續把教材分類。柳如煙也沒有再說什麼，只是偶爾把整理好的書本遞給你。兩人配合得意外地順利。",
                special: "organized_materials"
            }
        ]
    },
    // 第 17 幕
    {
        text: "放學後，教室裡的人逐漸散去。柳如煙還坐在位置上整理課本，窗外的夕陽落在她的筆記本上。你收拾好書包，正準備離開，她忽然抬起頭。",
        choices: [
            {
                text: "主動問她要不要一起回家",
                response: () => getStoryText(
                    "「要一起走嗎？」你問。柳如煙愣了一下，隨即收起筆記本。「好啊，剛好我也準備走了。」",
                    {
                        accepted_invitation: "你問她要不要一起回家。柳如煙很自然地站起身：「好啊，反正上次也聊得滿開心的。」",
                        declined_invitation: "你問她要不要一起回家。柳如煙稍微猶豫了一下，最後還是點頭：「可以啊。」你們之間仍留著一點尚未消散的尷尬。"
                    }
                ),
                affection: 3,
                flag: "walked_together"
            },
            {
                text: "跟她打聲招呼就先離開",
                response: "你向柳如煙揮了揮手，背起書包離開教室。她也向你道別，隨後低下頭繼續整理東西。",
                affection: 0,
                flag: "left_after_school"
            }
        ]
    },

    // ==============================
    // 第 18 幕
    // ==============================
    {
        text: "隔天早上，教室裡比平常熱鬧。有人正在討論週末的安排，柳如煙則安靜地翻閱一本校園刊物。當你經過她的座位時，她抬頭看了你一眼。",
        choices: [
            {
                text: "問她正在看什麼",
                response: "「這個嗎？」柳如煙把刊物稍微轉向你。「是以前學校辦活動時留下來的紀錄，沒想到裡面有這麼多有趣的事情。」她指著其中一張校園照片，和你聊起學校以前的活動。",
                affection: 2,
                flag: "discussed_school_history"
            },
            {
                text: "和同學聊別的事情",
                response: "你轉身加入同學們的話題。柳如煙看了你一眼，沒有打擾你，繼續翻閱手中的刊物。",
                affection: 0,
                flag: "ignored_school_history"
            }
        ]
    },

    // ==============================
    // 第 19 幕
    // ==============================
    {
        text: "午休時，柳如煙拿著一本筆記本來到座位旁。她似乎想詢問你某件事，卻又停頓了一下，最後只是把筆記本放在桌上。",
        choices: [
            {
                text: "問她是不是有話想說",
                response: "「你怎麼知道？」柳如煙有些驚訝，接著笑了笑。「其實沒什麼，只是想問你，平常心情不好的時候都會做什麼？」她沒有催促你回答，只是安靜地等著。",
                affection: 3,
                flag: "asked_her_feelings"
            },
            {
                text: "等她自己開口",
                response: "你沒有追問，只是繼續整理桌上的東西。過了一會兒，柳如煙像是放棄了原本的念頭，拿起筆記本回到自己的位置。",
                affection: 0,
                flag: "waited_for_her"
            }
        ]
    },

    // ==============================
    // 第 20 幕
    // ==============================
    {
        text: "放學前，天空忽然暗了下來。窗外傳來細碎的雨聲，同學們紛紛拿出雨傘。柳如煙停下手邊的動作，望向窗外，似乎比平常多看了一會兒。",
        choices: [
            {
                text: "問她喜不喜歡下雨天",
                response: "「下雨天嗎？」柳如煙望著窗外，輕輕笑了笑。「我其實滿喜歡雨聲的，尤其是安靜的時候。」她說完便拿起書包，像是覺得這只是個再普通不過的話題。",
                affection: 2,
                flag: "talked_about_rain"
            },
            {
                text: "提醒她別忘記帶傘",
                response: "你提醒柳如煙帶傘。她低頭看了看自己的書包，這才發現忘了準備。「還好你有提醒我，謝謝。」她向你道謝，接著開始思考該怎麼回家。",
                affection: 2,
                flag: "reminded_her_umbrella"
            }
        ]
    },

    // ==============================
    // 第 21 幕
    // ==============================
    {
        text: "雨勢逐漸變小。你和柳如煙在校門附近遇見，她正站在屋簷下看著遠處的天空。聽見你的腳步聲，她轉過頭，神情恢復了平常的模樣。",
        choices: [
            {
                text: "邀請她一起走到車站",
                response: () => getStoryText(
                    "「一起走吧。」你說。柳如煙點點頭，與你並肩走出校門。一路上，你們聊著學校的事情，偶爾停下來看一眼路旁被雨水洗亮的樹葉。",
                    {
                        walked_together: "「又遇到了啊。」柳如煙笑著走到你身旁。你們一邊走，一邊接續昨天沒聊完的話題。",
                        left_after_school: "柳如煙看見你後，禮貌地向你打招呼。聽見你的邀請，她猶豫了一下，才拿起雨傘跟上你的腳步。"
                    }
                ),
                affection: 3,
                flag: "walked_to_station"
            },
            {
                text: "向她道別，自己先回家",
                response: "你向柳如煙道別，獨自走進雨後的街道。她站在屋簷下向你揮手，直到你走遠，才轉身離開。",
                affection: 0,
                flag: "went_home_alone"
            }
        ]
    },
];

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
    if (hiddenEndingUnlocked) return "隱藏結局";
    if (affection >= 90) return "好結局";
    if (affection >= 55) return "普通結局";
    return "失敗結局";
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
        `好感度：${affection} / ${MAX_AFFECTION}`;

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

    fillElement.style.width = `${affection}%`;
}

// ========================================
// 5. 開始遊戲
// ========================================

function startGame() {
    const menu = document.getElementById("menu");
    const game = document.getElementById("game");
    const endingCg = document.getElementById("ending-cg");

    // 避免重複開始
    if (menu.classList.contains("menu-fade-out")) return;

    stopTyping();
    stopEndingTimer();
    // 開始播放背景音樂
    bgm.play().catch(error => {
        console.warn("背景音樂播放失敗：", error);
    });
    // 重設遊戲資料
    affection = 0;
    dialogueStep = 0;
    currentSceneIndex = 0;
    hasChosen = false;
    hiddenEndingUnlocked = false;
    specialChoices.clear();
    storyFlags.clear();
    discoveredClues.clear();
    solvedPuzzles.clear();

    relationshipStage = "normal";
    currentText = "";
    endingCg.style.display = "none";
    endingCg.classList.remove("show-ending", "fade-out");

    // 先準備第一幕背景，避免顯示遊戲後才切換背景
    const firstScene = storyScenes[0];
    const background = document.getElementById("scene-background");

    if (background && firstScene.background) {
        const imagePath = sceneBackgrounds[firstScene.background];

        if (imagePath) {
            background.style.backgroundImage = `url("${imagePath}")`;
        }
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

function renderScene(index) {
    stopTyping();

    if (index >= storyScenes.length) {
        showEnding();
        return;
    }

    currentSceneIndex = index;
    dialogueStep = index;
    hasChosen = false;

    const scene = storyScenes[index];

    // 1. 更新劇情背景
    
    const background = document.getElementById("scene-background");

    if (background && scene.background) {
        const nextBackground = sceneBackgrounds[scene.background];

        if (nextBackground) {
            const currentBackground = background.style.backgroundImage;
            const targetBackground = `url("${nextBackground}")`;

            if (currentBackground !== targetBackground) {
                
                background.classList.add("background-fade-out");

                setTimeout(() => {
                    background.style.backgroundImage = targetBackground;

                    // 強制瀏覽器先套用新背景與透明度
                    void background.offsetWidth;

                    requestAnimationFrame(() => {
                        background.classList.remove("background-fade-out");
                    });
                }, 300);

            }
        }
    }


    // 2. 更新角色名稱
    document.getElementById("character-name").textContent =
        scene.name;

    // 3. 更新劇情進度
    document.getElementById("scene-progress").textContent =
        `第 ${index + 1} / ${totalScenes} 段`;

    // 4. 隱藏選項
    document.getElementById("story-choices").style.display =
        "none";

    // 5. 顯示角色與劇情
    changeCharacter("normal");
    typeDialogue(scene.text);
    showStoryChoices(scene.choices);
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
            if (hasChosen) return;
            playClickSound();

            // 若劇情還在打字，先顯示完整文字
            if (typingTimer !== null) {
                stopTyping();
                document.getElementById("dialogue").textContent =
                    currentText;
                return;
            }

            hasChosen = true;

            affection = Math.max(
                0,
                Math.min(MAX_AFFECTION, affection + choice.affection)
            );

            if (choice.special) {
                specialChoices.add(choice.special);
            }

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
            typeDialogue(responseText);
            });

        container.appendChild(button);
    });

    container.style.display = "block";
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

    // 文字還在逐字顯示：立即顯示全文
    if (typingTimer !== null) {
        stopTyping();
        dialogue.textContent = currentText;
        return;
    }

    // 尚未選擇回答，不進入下一段
    if (!hasChosen) {
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

    affection = 0;
    dialogueStep = 0;
    currentSceneIndex = 0;
    hasChosen = false;
    hiddenEndingUnlocked = false;
    specialChoices.clear();
    storyFlags.clear();
    discoveredClues.clear();
    solvedPuzzles.clear();

    relationshipStage = "normal";
    currentText = "";
    endingCgStep = 0;

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

function typeDialogue(text) {
    stopTyping();

    const dialogue = document.getElementById("dialogue");

    currentText = text;
    dialogue.textContent = "";

    dialogue.style.animation = "none";
    void dialogue.offsetWidth;
    dialogue.style.animation = "dialogueFadeIn 0.5s ease";

    // 關閉逐字顯示，直接呈現完整文字
    if (!gameSettings.typewriter || currentText.length === 0) {
        dialogue.textContent = currentText;
        return;
    }

    let index = 0;
    const interval = textSpeedMap[gameSettings.textSpeed] || 35;

    typingTimer = setInterval(() => {
        dialogue.textContent += currentText[index];
        index++;

        if (index >= currentText.length) {
            clearInterval(typingTimer);
            typingTimer = null;
            dialogue.textContent = currentText;
        }
    }, interval);
}

function typeDialogue(text) {
    // 清除上一段尚未完成的打字效果
    stopTyping();

    const dialogue = document.getElementById("dialogue");

    currentText = text;
    dialogue.textContent = "";

    // 重新播放文字淡入動畫
    dialogue.style.animation = "none";
    void dialogue.offsetWidth;
    dialogue.style.animation = "dialogueFadeIn 0.5s ease";

    // 關閉逐字效果時，直接顯示完整文字
    if (!gameSettings.typewriter || currentText.length === 0) {
        dialogue.textContent = currentText;
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

/* 立即顯示完整對話 */
function finishTyping() {
    if (typingTimer === null) {
        return false;
    }

    clearInterval(typingTimer);
    typingTimer = null;

    const dialogue = document.getElementById("dialogue");
    dialogue.textContent = currentText;

    return true;
}

/* 停止逐字顯示 */
function stopTyping() {
    if (typingTimer !== null) {
        clearInterval(typingTimer);
        typingTimer = null;
    }
}

// ========================================
// 13. 切換女主角表情
// ========================================

function changeCharacter(expression) {
    const characterArea = document.getElementById("character-area");
    const characterImage = document.getElementById("character-image");

    const expressions = {
        normal: "images/heroine.png",
        happy: "images/heroine_happy.png",
        angry: "images/heroine_angry.png",
        love: "images/heroine_love.png"
    };

    const nextImage = expressions[expression] || expressions.normal;

    // 如果圖片相同，就不重複切換
    if (characterImage.dataset.expression === expression) {
        return;
    }

    characterImage.dataset.expression = expression;

    // 先淡出舊表情
    characterImage.style.opacity = "0";

    setTimeout(() => {
        characterImage.src = nextImage;

        // 等待新圖片載入後淡入
        if (characterImage.complete) {
            characterImage.style.opacity = "1";
        } else {
            characterImage.onload = () => {
                characterImage.style.opacity = "1";
                characterImage.onload = null;
            };
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
        alert("目前的瀏覽器不支援全螢幕功能。");
        return;
    }

    document.documentElement.requestFullscreen().catch(error => {
        console.warn("無法切換全螢幕。", error);
        alert("無法開啟全螢幕，請確認瀏覽器是否允許。");
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

        // 若目前正在顯示文字，立即套用新設定
        if (typingTimer !== null && !gameSettings.typewriter) {
            stopTyping();
            document.getElementById("dialogue").textContent = currentText;
        }
    });

    // 點擊設定視窗外部關閉
    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            toggleSettings(false);
        }
    });

    // 按 Escape 關閉設定
    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            overlay.style.display !== "none"
        ) {
            toggleSettings(false);
        }
    });

    loadGameSettings();
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

function saveGame() {   
    if (
        currentSceneIndex < 0 ||
        currentSceneIndex >= storyScenes.length
    ) {
        alert("目前沒有可保存的劇情進度！");
        return;
    }
        
    const saveData = {
        version: 1,
        affection: affection,
        dialogueStep: dialogueStep,
        currentSceneIndex: currentSceneIndex,
        hiddenEndingUnlocked: hiddenEndingUnlocked,
        specialChoices: Array.from(specialChoices),
        discoveredClues: Array.from(discoveredClues),
        solvedPuzzles: Array.from(solvedPuzzles),
        storyFlags: Array.from(storyFlags),
        relationshipStage: relationshipStage,
        savedAt: new Date().toLocaleString("zh-TW")
    };


    // 如果已經有存檔，先詢問是否覆蓋
    if (localStorage.getItem("heartDaysSave")) {
        const confirmOverwrite = confirm(
            "已經有一份存檔，確定要覆蓋嗎？"
        );

        if (!confirmOverwrite) {
            return;
        }
    }

    localStorage.setItem(
        "heartDaysSave",
        JSON.stringify(saveData)
    );
    document.getElementById("save-status").textContent =
    "上次存檔：" + saveData.savedAt;
    alert("遊戲進度已保存！");
}


function loadGame() {
    const savedData = localStorage.getItem("heartDaysSave");

    if (!savedData) {
        alert("目前沒有保存的遊戲進度！");
        return;
    }

    try {
        const saveData = JSON.parse(savedData);
        
        if (
            saveData.version !== undefined &&
            saveData.version !== 1
        ) {
            alert("這份存檔的版本不相容，請使用相容版本的遊戲。");
            return;
        }


        // 檢查存檔資料是否完整
        if (
            typeof saveData.affection !== "number" ||
            typeof saveData.currentSceneIndex !== "number" ||
            !Array.isArray(saveData.specialChoices) ||
            saveData.currentSceneIndex < 0 ||
            saveData.currentSceneIndex >= storyScenes.length
        ) {
            alert("存檔資料格式錯誤，無法讀取！");
            return;
        }

        affection = Math.max(
            0,
            Math.min(MAX_AFFECTION, saveData.affection)
        );

        currentSceneIndex = saveData.currentSceneIndex;
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

        updateAffection();
        renderScene(currentSceneIndex);

        updateSaveStatus();

        alert("存檔資料已讀取！");
    } catch (error) {
        console.error("讀檔失敗：", error);
        alert("存檔資料損壞，無法讀取！");
    }
}

function updateSaveStatus() {
    const status = document.getElementById("save-status");
    const savedData = localStorage.getItem("heartDaysSave");

    if (!status) return;

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
