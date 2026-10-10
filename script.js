
"use strict";

// ========================================
// 1. 遊戲變數
// ========================================

let affection = 0;
let dialogueStep = 0;
let currentSceneIndex = 0;
let hasChosen = false;
let hiddenEndingUnlocked = false;
let specialChoices = new Set();

let typingTimer = null;
let currentText = "";
let endingCgStep = 0;
let currentEndingText = "";
let endingTimer = null;

const totalScenes = 20;
const MAX_AFFECTION = 100;

// ========================================
// 2. 劇情資料
// ========================================

const storyScenes = [
    {
        name: "旁白",
        text: "早自習前，你走進教室。窗邊坐著一位陌生的女孩，聽同學說她好像叫柳如煙，她正低頭整理課本。你們還沒有正式說過話。",
        choices: [
            { text: "主動向她打招呼", affection: 3, expression: "normal", response: "柳如煙抬起頭，稍微愣了一下。「早安。」她禮貌地回應，接著繼續整理課本。", special: "first_greeting" },
            { text: "直接坐下，不理會她", affection: 0, expression: "normal", response: "你直接回到座位。柳如煙看了你一眼，沒有說話，教室裡又恢復了原本的安靜。" }
        ]
    },
    {
        name: "柳如煙",
        text: "過了一會兒，柳如煙拿著課本走到你旁邊。「不好意思，我想問一下，今天第一節是數學課嗎？」",
        choices: [
            { text: "耐心告訴她課程安排", affection: 5, expression: "happy", response: "柳如煙確認課表後，輕輕點頭。「謝謝你，還好有問你。」她的語氣比剛才自然了一些。" },
            { text: "不耐煩地叫她自己看課表", affection: -4, expression: "angry", response: "柳如煙皺起眉頭。「我只是問一下而已，有必要這麼兇嗎？」她拿著課本回到座位，沒有再看你。" }
        ]
    },
    {
        name: "旁白",
        text: "下課後，柳如煙一個人坐在座位上。其他同學陸續離開教室，她似乎還不太熟悉這個班級。",
        choices: [
            { text: "問她要不要一起去福利社", affection: 5, expression: "happy", response: "柳如煙孩有些意外。「可以呀，我正好想去買水。」她收好錢包，和你一起走出教室。" },
            { text: "當著她的面說她很孤僻", affection: -6, expression: "angry", response: "柳如煙的表情立刻沉了下來。「我只是還不熟悉大家，不代表我很孤僻。」她說完便轉身離開。" }
        ]
    },
    {
        name: "柳如煙",
        text: "走到福利社後，柳如煙看著冰櫃裡的飲料。「你平常都喝什麼？我每次來都不知道該買哪一種。」",
        choices: [
            { text: "推薦自己喜歡的飲料", affection: 4, expression: "happy", response: "柳如煙聽得很認真。「那我下次試試看！如果好喝，再跟你分享心得。」" },
            { text: "敷衍地說隨便買就好", affection: -2, expression: "normal", response: "柳如煙看了你一眼。「好吧，那我自己選。」她拿起一瓶飲料，沒有再問你。" }
        ]
    },
    {
        name: "旁白",
        text: "回到教室後，老師突然宣布要使用課本。柳如煙翻遍書包，才發現自己忘記帶課本了。",
        choices: [
            { text: "主動和她共用課本", affection: 6, expression: "happy", response: "柳如煙鬆了一口氣。「真的可以嗎？謝謝你，我會小心翻頁的。」她把椅子稍微移近了一點，方便一起看課本。" },
            { text: "嘲笑她連課本都會忘記", affection: -7, expression: "angry", response: "柳如煙立刻合上書包。「忘記帶課本又不是故意的，你不用這樣取笑我吧？」她整節課都沒有再主動和你說話。" }
        ]
    },
    {
        name: "柳如煙",
        text: "下課時，柳如煙把共用的課本推回你面前。「謝謝你剛才借我看。要不是你，我大概會被老師罵了。」",
        choices: [
            { text: "笑著說沒關係", affection: 4, expression: "happy", response: "柳如煙笑了笑。「你人還不錯嘛。」說完，她似乎有點不好意思，低頭收拾桌面。" },
            { text: "要求她以後一定要回報", affection: -3, expression: "angry", response: "柳如煙皺起眉頭。「我只是借看一下課本，又不是欠你什麼。」她把課本放回桌上，語氣明顯冷了下來。" }
        ]
    },
    {
        name: "旁白",
        text: "午休時，你看到柳如煙坐在窗邊看書。陽光照在書頁上，她看得十分專心，甚至沒有注意到你走近。",
        choices: [
            { text: "等她讀完一段再詢問", affection: 6, expression: "happy", response: "柳如煙看完那一頁後抬起頭。「你想知道這本書的內容嗎？」她把封面轉向你，開始分享自己喜歡的部分。", special: "respect_boundaries" },
            { text: "直接搶過她的書看", affection: -8, expression: "angry", response: "柳如煙迅速把書拿回來。「你為什麼不先問我？」她的聲音不大，卻明顯帶著怒氣。" }
        ]
    },
    {
        name: "柳如煙",
        text: "柳如煙聊到書裡的某個角色時，忽然露出期待的神情。「我覺得他最後做的決定很勇敢，你覺得呢？」",
        choices: [
            { text: "說出自己的想法，也聽她解釋", affection: 6, expression: "happy", response: "柳如煙和你討論了好一會兒。「原來你是這樣想的！跟你聊天還滿有意思的。」她第一次主動問你平常喜歡什麼。" },
            { text: "直接說她的想法很幼稚", affection: -7, expression: "angry", response: "柳如煙的笑容消失了。「你不認同可以直接說，不用把我的想法講得那麼難聽。」她把書收起來，結束了話題。" }
        ]
    },
    {
        name: "旁白",
        text: "體育課分組時，柳如煙發現自己和不熟悉的同學分在一組。她看起來有些緊張，卻沒有開口求助。",
        choices: [
            { text: "主動和她一組，並互相配合", affection: 5, expression: "happy", response: "柳如煙看見你走過來，神情放鬆了一些。「那就麻煩你了，我可能沒那麼擅長這個活動。」你們開始一起練習。" },
            { text: "當著大家的面說她一定會拖累人", affection: -8, expression: "angry", response: "柳如煙抿緊嘴唇。「我還沒開始做，你就知道我不行了嗎？」她不再看你，默默走到隊伍後面。" }
        ]
    },
    {
        name: "柳如煙",
        text: "活動結束後，柳如煙擦了擦額頭的汗。「剛才謝謝你配合我。雖然我有幾次沒做好，但還滿開心的。」",
        choices: [
            { text: "肯定她努力的地方", affection: 6, expression: "happy", response: "柳如煙露出真心的笑容。「你真的這樣覺得嗎？那我下次會再努力一點。」她看起來比平常更有精神。" },
            { text: "只責怪她做得不夠好", affection: -6, expression: "angry", response: "柳如煙沉默了一下。「我已經盡力了。如果你只想責怪我，下次就不用一起了。」" }
        ]
    },
    {
        name: "旁白",
        text: "隔天早上，你發現柳如煙比平常安靜。她坐在位置上看著窗外，桌上放著一張沒有寫完的筆記。",
        choices: [
            { text: "先詢問她今天還好嗎", affection: 5, expression: "normal", response: "柳如煙搖搖頭，又停了一下。「沒什麼，只是昨天沒睡好。」她似乎還不想多談，但願意回答你。" },
            { text: "追問她到底在煩什麼", affection: -4, expression: "angry", response: "柳如煙皺起眉頭。「我說沒事就是沒事，可以不要一直問嗎？」她需要一點自己的空間。" }
        ]
    },
    {
        name: "柳如煙",
        text: "午餐時間，柳如煙發現自己忘了帶餐具。她看著便當，苦惱地嘆了一口氣。",
        choices: [
            { text: "問她需不需要幫忙借餐具", affection: 5, expression: "happy", response: "柳如煙抬起頭。「如果方便的話，可以麻煩你嗎？謝謝！」她接過餐具後，主動和你聊起今天的午餐。" },
            { text: "笑她怎麼總是忘東忘西", affection: -5, expression: "angry", response: "柳如煙不高興地看著你。「每個人都會忘記事情吧？你一直講真的很煩。」" }
        ]
    },
    {
        name: "旁白",
        text: "午餐快結束時，柳如煙問起你平常放學後都做些什麼。這是她第一次主動詢問你生活中的事情。",
        choices: [
            { text: "認真分享自己的興趣，也問問她", affection: 6, expression: "happy", response: "柳如煙聽得很專心，接著也分享自己的興趣。「原來你喜歡這些！下次有機會可以再聊。」你們發現彼此有些共同點。", special: "shared_interest" },
            { text: "只顧著說自己的事，不讓她插話", affection: -4, expression: "angry", response: "柳如煙等了一會兒，終於打斷你。「我也想說話，可以讓我講完嗎？」她有些不耐煩地低頭吃飯。" }
        ]
    },
    {
        name: "柳如煙",
        text: "放學前，柳如煙在走廊上追上你。「你明天會提早到學校嗎？我有一題數學題不太懂，想問問看。」",
        choices: [
            { text: "答應她，並約好明天一起看題目", affection: 6, expression: "happy", response: "柳如煙拿出筆記本記下來。「那明天見！我會先把題目整理好。」她揮揮手，走路的步伐似乎輕快了些。" },
            { text: "隨口答應，卻沒把她的事放在心上", affection: -5, expression: "normal", response: "柳如煙點點頭。「好，那明天見。」她把筆記本收好，沒有察覺你其實沒打算赴約。" }
        ]
    },
    {
        name: "旁白",
        text: "隔天早上，你來到教室，發現柳如煙已經坐在位置上等著。桌上放著整理好的數學題目。",
        choices: [
            { text: "準時赴約，陪她一起解題", affection: 8, expression: "happy", response: "柳如煙看見你準時出現，露出放心的笑容。「你真的來了！那我們從這一題開始吧。」你們一起討論，終於解開了題目。", special: "kept_promise" },
            { text: "忘記約定，直到她提醒才想起", affection: -8, expression: "angry", response: "柳如煙看著你，語氣明顯失望。「你昨天明明答應我了……算了，我自己再研究看看。」她把題目收回去。" }
        ]
    },
    {
        name: "柳如煙",
        text: "解完題目後，柳如煙忽然問你：「如果有一天朋友誤會了你，你會怎麼做？」她看起來不像是在問課本上的問題。",
        choices: [
            { text: "說明溝通的重要，也願意聽對方說", affection: 6, expression: "happy", response: "柳如煙安靜地聽著，最後點了點頭。「我也覺得，至少應該先聽對方說完。」她像是把你的話記在心裡。", special: "honest_communication" },
            { text: "說不爽就不要再當朋友", affection: -6, expression: "angry", response: "柳如煙皺起眉頭。「可是有時候誤會不一定是故意的吧？什麼都不說就放棄，未免太可惜了。」" }
        ]
    },
    {
        name: "旁白",
        text: "某天下午，你無意間聽見其他同學談論柳如煙的事情。內容並不完整，你也不知道事情的真相。",
        choices: [
            { text: "不跟著傳話，直接向她確認", affection: 7, expression: "happy", response: "柳如煙聽完後，神情逐漸放鬆。「謝謝你願意先問我，而不是直接相信別人說的話。」她慢慢把事情的經過告訴你。", special: "trust" },
            { text: "沒弄清楚就跟著別人議論她", affection: -10, expression: "angry", response: "柳如煙得知後，生氣地看著你。「你連事情都沒弄清楚，就跟著別人講我？」她轉身離開，暫時不想和你說話。" }
        ]
    },
    {
        name: "柳如煙",
        text: "隔天，柳如煙仍然有些在意昨天的事情。你們在樓梯口碰見，她停下腳步，似乎在等你先開口。",
        choices: [
            { text: "真誠道歉，承認自己沒有查清楚", affection: 7, expression: "normal", response: "柳如煙沉默了一會兒，才說：「我還是有點在意，但謝謝你願意道歉。希望下次你能先問清楚。」她沒有立刻恢復笑容，卻願意聽你說完。", special: "sincere_apology" },
            { text: "覺得她太小題大作，反過來怪她", affection: -10, expression: "angry", response: "柳如煙的表情冷了下來。「你到現在還覺得是我的問題嗎？我不想再談了。」她轉身離開。" }
        ]
    },
    {
        name: "旁白",
        text: "放學時，天空突然下起大雨。柳如煙站在走廊，看著雨水打在地面上。她翻了翻書包，才發現自己忘了帶傘。",
        choices: [
            { text: "詢問她的想法，提議一起等雨停", affection: 6, expression: "happy", response: "柳如煙想了想，點頭說：「好啊，反正雨也很大。」你們站在走廊，一開始只是看雨，後來才慢慢聊起生活中的小事。" },
            { text: "不告而別，讓她自己想辦法", affection: -3, expression: "normal", response: "你收拾好東西先行離開。柳如煙看著你離去的方向，輕輕嘆了口氣，接著拿出手機查看公車時間。" }
        ]
    },
    {
        name: "柳如煙",
        text: "雨勢漸漸變小。柳如煙看著你，像是猶豫了很久，才小聲說：「其實，跟你相處的這段時間，我覺得自己慢慢比較自在了。」",
        choices: [
            { text: "告訴她自己也很珍惜這段友誼", affection: 7, expression: "happy", response: "柳如煙露出有些害羞的笑容。「嗯……那我們以後也繼續好好相處吧。」她看向雨停後的天空，語氣比以前柔和許多。", special: "mutual_trust" },
            { text: "立刻逼問她是不是喜歡自己", affection: -5, expression: "angry", response: "柳如煙嚇了一跳，接著皺起眉頭。「我只是想好好跟你相處，你為什麼要突然逼我回答這種問題？」她需要時間整理自己的心情。" }
        ]
    },
    {
        name: "旁白",
        text: "幾天後，學校宣布即將舉辦班級活動。柳如煙拿著活動表走到你面前，問你願不願意和她一起準備。",
        choices: [
            { text: "答應一起準備，並尊重彼此的想法", affection: 7, expression: "happy", response: "柳如煙開心地點頭。「太好了，那我們一起想辦法！」你們開始分工，也在討論中更加了解彼此。", special: "teamwork" },
            { text: "要求她全部照自己的意思做", affection: -7, expression: "angry", response: "柳如煙把活動表收回去。「這是兩個人一起做的事情，不是只有你的想法才重要。」她決定先冷靜一下。" }
        ]
    }
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
    stopTyping();
    stopEndingTimer();

    affection = 0;
    dialogueStep = 0;
    currentSceneIndex = 0;
    hasChosen = false;
    hiddenEndingUnlocked = false;
    specialChoices.clear();
    currentText = "";

    const menu = document.getElementById("menu");
    const game = document.getElementById("game");
    const endingCg = document.getElementById("ending-cg");
    const nextButton = document.getElementById("next-button");

    // 避免重複開始
    if (menu.classList.contains("menu-fade-out")) return;

    // 主畫面開始淡出
    menu.classList.add("menu-fade-out");

    // 等待主畫面淡出完成，再顯示遊戲
    setTimeout(() => {
        menu.style.display = "none";
        menu.classList.remove("menu-fade-out");

        // 重設遊戲畫面
        game.style.display = "block";
        game.classList.remove("game-fade-in");

        // 重新觸發遊戲畫面淡入動畫
        void game.offsetWidth;
        game.classList.add("game-fade-in");

        endingCg.style.display = "none";
        endingCg.classList.remove("show-ending", "fade-out");

        nextButton.style.display = "block";
        nextButton.disabled = false;
        nextButton.textContent = "下一段 ▶";

        updateAffection();
        changeCharacter("normal");
        renderScene(0);

        // 動畫結束後移除動畫類別
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

    document.getElementById("character-name").textContent = scene.name;

    document.getElementById("scene-progress").textContent =
        `第 ${index + 1} / ${totalScenes} 段`;

    document.getElementById("story-choices").style.display = "none";
    document.getElementById("next-button").style.display = "block";

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

            // 隱藏結局條件：
            // 至少三種特殊選擇、好感度至少 75，
            // 最後一段選擇 teamwork
            if (
                specialChoices.size >= 3 &&
                affection >= 75 &&
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
            typeDialogue(choice.response);
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

    // 第一次點擊：顯示完整文字
    if (typingTimer !== null) {
        stopTyping();
        dialogue.textContent = currentText;
        return;
    }

    if (!hasChosen) {
        alert("請先選擇一個回答！");
        return;
    }

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

    if (endingCgStep === 0) {
        document.getElementById("ending-cg-dialogue").textContent =
            currentEndingText;

        document.getElementById("ending-cg-hint").textContent =
            "再次點擊返回主選單 ▶";

        endingCgStep = 1;
        return;
    }

    if (endingCgStep === 2) return;
    endingCgStep = 2;

    cgArea.classList.remove("show-ending");
    cgArea.classList.add("fade-out");

    stopEndingTimer();

    endingTimer = setTimeout(() => {
        endingTimer = null;
        restartGame();
    }, 2000);
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
    document.getElementById("next-button").style.display = "none";

    document.getElementById("scene-progress").textContent =
        `故事結束｜共 ${totalScenes} 段`;

    document.getElementById("character-name").textContent = "遊戲結局";

    showEndingCG(getEnding());
}

// ========================================
// 11. 重新開始
// ========================================

function restartGame() {
    stopTyping();
    stopEndingTimer();

    affection = 0;
    dialogueStep = 0;
    currentSceneIndex = 0;
    hasChosen = false;
    hiddenEndingUnlocked = false;
    specialChoices.clear();
    currentText = "";
    endingCgStep = 0;

    const game = document.getElementById("game");
    const menu = document.getElementById("menu");
    const cgArea = document.getElementById("ending-cg");
    const choices = document.getElementById("story-choices");
    const nextButton = document.getElementById("next-button");

    cgArea.style.display = "none";
    cgArea.classList.remove("show-ending", "fade-out");

    game.style.display = "none";
    menu.style.display = "flex";

    document.getElementById("character-name").textContent = "旁白";

    document.getElementById("dialogue").textContent =
        "你走進教室，發現一位陌生的女孩坐在窗邊。";

    choices.innerHTML = "";
    choices.style.display = "none";

    nextButton.style.display = "block";
    nextButton.disabled = false;
    nextButton.textContent = "下一段 ▶";

    document.getElementById("scene-progress").textContent =
        `第 1 / ${totalScenes} 段`;

    updateAffection();
    changeCharacter("normal");
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

    let index = 0;

    if (currentText.length === 0) return;

    typingTimer = setInterval(() => {
        dialogue.textContent += currentText[index];
        index++;

        if (index >= currentText.length) {
            stopTyping();
        }
    }, 35);
}

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
    const image = document.getElementById("character-image");

    const images = {
        normal: "images/heroine.png",
        happy: "images/heroine_happy.png",
        angry: "images/heroine_angry.png",
        love: "images/heroine_love.png"
    };

    const newSrc = images[expression] || images.normal;

    if (image.getAttribute("src") === newSrc) {
        image.style.opacity = "1";
        return;
    }

    image.style.opacity = "0";

    const oldOnLoad = image.onload;
    const oldOnError = image.onerror;

    image.onload = null;
    image.onerror = null;

    setTimeout(() => {
        image.onload = () => {
            image.style.opacity = "1";
            image.onload = null;
            image.onerror = null;
        };

        image.onerror = () => {
            image.style.opacity = "1";
            image.onload = null;
            image.onerror = null;
            console.error("圖片載入失敗：" + newSrc);
        };

        image.src = newSrc;

        // 圖片已經在快取中時也確保顯示
        if (image.complete && image.naturalWidth > 0) {
            image.style.opacity = "1";
            image.onload = null;
            image.onerror = null;
        }
    }, 200);
}
