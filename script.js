
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
    {
        name: "旁白",
        background: "classroom",
        text: "早自習前，你走進教室。窗邊坐著一位陌生的女孩，老師昨天說的轉校生柳如煙就是她吧，她正低頭整理課本。你們還沒有正式說過話。",
        choices: [
            { text: "主動向她打招呼", affection: 3, expression: "normal", response: "柳如煙抬起頭，稍微愣了一下。「早安。」她禮貌地回應，接著繼續整理課本。", special: "first_greeting" },
            { text: "直接坐下，不理會她", affection: 0, expression: "normal", response: "你直接回到座位。柳如煙看了你一眼，沒有說話，教室裡又恢復了原本的安靜。" }
        ]
    },
    {
        name: "柳如煙",
        background: "classroom",
        text: "過了一會兒，柳如煙拿著課本走到你旁邊。「不好意思，我想問一下，今天第一節是數學課嗎？」",
        choices: [
            { text: "耐心告訴她課程安排", affection: 5, expression: "happy", response: "柳如煙確認課表後，輕輕點頭。「謝謝你，還好有問你。」她的語氣比剛才自然了一些。" },
            { text: "不耐煩地叫她自己看課表", affection: -4, expression: "angry", response: "柳如煙皺起眉頭。「我只是問一下而已，有必要這麼兇嗎？」她拿著課本回到座位，沒有再看你。" }
        ]
    },
    {
        name: "旁白",
        background: "classroom",
        text: "下課後，柳如煙一個人坐在座位上。其他同學陸續離開教室，她似乎還不太熟悉這個班級。",
        choices: [
            { text: "問她要不要一起去福利社", affection: 5, expression: "happy", response: "柳如煙有些意外。「可以呀，我正好想去買水。」她收好錢包，和你一起走出教室。" },
            { text: "當著她的面說她很孤僻", affection: -6, expression: "angry", response: "柳如煙的表情立刻沉了下來。「我只是還不熟悉大家，不代表我很孤僻。」她說完便轉身離開。" }
        ]
    },
    {
        name: "柳如煙",
        background: "school",          
        text: "走到福利社後，柳如煙看著冰櫃裡的飲料。「你平常都喝什麼？我每次來都不知道該買哪一種。」",
        choices: [
            { text: "推薦自己喜歡的飲料", affection: 4, expression: "happy", response: "柳如煙聽得很認真。「那我下次試試看！如果好喝，再跟你分享心得。」" },
            { text: "敷衍地說隨便買就好", affection: -2, expression: "normal", response: "柳如煙看了你一眼。「好吧，那我自己選。」她拿起一瓶飲料，沒有再問你。" }
        ]
    },
    {
        name: "旁白",
        background: "classroom",
        text: "回到教室後，老師突然宣布要使用課本。柳如煙翻遍書包，才發現自己忘記帶課本了。",
        choices: [
            { text: "主動和她共用課本", affection: 6, expression: "happy", response: "柳如煙鬆了一口氣。「真的可以嗎？謝謝你，我會小心翻頁的。」她把椅子稍微移近了一點，方便一起看課本。" },
            { text: "嘲笑她連課本都會忘記", affection: -7, expression: "angry", response: "柳如煙立刻合上書包。「忘記帶課本又不是故意的，你不用這樣取笑我吧？」她整節課都沒有再主動和你說話。" }
        ]
    },
    {
        name: "柳如煙",
        background: "classroom",
        text: "下課時，柳如煙把共用的課本推回你面前。「謝謝你剛才借我看。要不是你，我大概會被老師罵了。」",
        choices: [
            { text: "笑著說沒關係", affection: 4, expression: "happy", response: "柳如煙笑了笑。「你人還不錯嘛。」說完，她似乎有點不好意思，低頭收拾桌面。" },
            { text: "要求她以後一定要回報", affection: -3, expression: "angry", response: "柳如煙皺起眉頭。「我只是借看一下課本，又不是欠你什麼。」她把課本放回桌上，語氣明顯冷了下來。" }
        ]
    },
    {
        name: "旁白",
        background: "library",
        text: "午休時，你看到柳如煙坐在圖書館看書。陽光照在書頁上，她看得十分專心，甚至沒有注意到你走近。",
        choices: [
            { text: "等她讀完一段再詢問", affection: 6, expression: "happy", response: "柳如煙看完那一頁後抬起頭。「你想知道這本書的內容嗎？」她把封面轉向你，開始分享自己喜歡的部分。", special: "respect_boundaries" },
            { text: "直接搶過她的書看", affection: -8, expression: "angry", response: "柳如煙迅速把書拿回來。「你為什麼不先問我？」她的聲音不大，卻明顯帶著怒氣。" }
        ]
    },
    {
        name: "柳如煙",
        background: "library",
        text: "柳如煙聊到書裡的某個角色時，忽然露出期待的神情。「我覺得他最後做的決定很勇敢，你覺得呢？」",
        choices: [
            { text: "說出自己的想法，也聽她解釋", affection: 6, expression: "happy", response: "柳如煙和你討論了好一會兒。「原來你是這樣想的！跟你聊天還滿有意思的。」她第一次主動問你平常喜歡什麼。" },
            { text: "直接說她的想法很幼稚", affection: -7, expression: "angry", response: "柳如煙的笑容消失了。「你不認同可以直接說，不用把我的想法講得那麼難聽。」她把書收起來，結束了話題。" }
        ]
    },
    {
        name: "旁白",
        background: "playground",
        text: "體育課分組時，柳如煙發現自己和不熟悉的同學分在一組。她看起來有些緊張，卻沒有開口求助。",
        choices: [
            { text: "主動和她一組，並互相配合", affection: 5, expression: "happy", response: "柳如煙看見你走過來，神情放鬆了一些。「那就麻煩你了，我可能沒那麼擅長這個活動。」你們開始一起練習。" },
            { text: "當著大家的面說她一定會拖累人", affection: -8, expression: "angry", response: "柳如煙抿緊嘴唇。「我還沒開始做，你就知道我不行了嗎？」她不再看你，默默走到隊伍後面。" }
        ]
    },
    {
        name: "柳如煙",
        background: "playground",
        text: "活動結束後，柳如煙擦了擦額頭的汗。「剛才謝謝你配合我。雖然我有幾次沒做好，但還滿開心的。」",
        choices: [
            { text: "肯定她努力的地方", affection: 6, expression: "happy", response: "柳如煙露出真心的笑容。「你真的這樣覺得嗎？那我下次會再努力一點。」她看起來比平常更有精神。" },
            { text: "只責怪她做得不夠好", affection: -6, expression: "angry", response: "柳如煙沉默了一下。「我已經盡力了。如果你只想責怪我，下次就不用一起了。」" }
        ]
    },
    {
        name: "旁白",
        background: "classroom",
        text: "隔天早上，你發現柳如煙比平常安靜。她坐在位置上看著窗外，桌上放著一張沒有寫完的筆記。",
        choices: [
            { text: "先詢問她今天還好嗎", affection: 5, expression: "normal", response: "柳如煙搖搖頭，又停了一下。「沒什麼，只是昨天沒睡好。」她似乎還不想多談，但願意回答你。" },
            { text: "追問她到底在煩什麼", affection: -4, expression: "angry", response: "柳如煙皺起眉頭。「我說沒事就是沒事，可以不要一直問嗎？」她需要一點自己的空間。" }
        ]
    },
    {
        name: "柳如煙",
        background: "classroom",
        text: "午餐時間，柳如煙發現自己忘了帶餐具。她看著便當，苦惱地嘆了一口氣。",
        choices: [
            { text: "問她需不需要幫忙借餐具", affection: 5, expression: "happy", response: "柳如煙抬起頭。「如果方便的話，可以麻煩你嗎？謝謝！」她接過餐具後，主動和你聊起今天的午餐。" },
            { text: "笑她怎麼總是忘東忘西", affection: -5, expression: "angry", response: "柳如煙不高興地看著你。「每個人都會忘記事情吧？你一直講真的很煩。」" }
        ]
    },
    {
        name: "旁白",
        background: "classroom",
        text: "午餐快結束時，柳如煙問起你平常放學後都做些什麼。這是她第一次主動詢問你生活中的事情。",
        choices: [
            { text: "認真分享自己的興趣，也問問她", affection: 6, expression: "happy", response: "柳如煙聽得很專心，接著也分享自己的興趣。「原來你喜歡這些！下次有機會可以再聊。」你們發現彼此有些共同點。", special: "shared_interest" },
            { text: "只顧著說自己的事，不讓她插話", affection: -4, expression: "angry", response: "柳如煙等了一會兒，終於打斷你。「我也想說話，可以讓我講完嗎？」她有些不耐煩地低頭吃飯。" }
        ]
    },
    {
        name: "柳如煙",
        background: "hallway", 
        text: "放學前，柳如煙在走廊上追上你。「你明天會提早到學校嗎？我有一題數學題不太懂，想問問看。」",
        choices: [
            { text: "答應她，並約好明天一起看題目", affection: 6, expression: "happy", response: "柳如煙拿出筆記本記下來。「那明天見！我會先把題目整理好。」她揮揮手，走路的步伐似乎輕快了些。" },
            { text: "隨口答應，卻沒把她的事放在心上", affection: -5, expression: "normal", response: "柳如煙點點頭。「好，那明天見。」她把筆記本收好，沒有察覺你其實沒打算赴約。" }
        ]
    },
    {
        name: "旁白",
        background: "classroom",
        text: "隔天早上，你來到教室，發現柳如煙已經坐在位置上等著。桌上放著整理好的數學題目。",
        choices: [
            { text: "準時赴約，陪她一起解題", affection: 8, expression: "happy", response: "柳如煙看見你準時出現，露出放心的笑容。「你真的來了！那我們從這一題開始吧。」你們一起討論，終於解開了題目。", special: "kept_promise" },
            { text: "忘記約定，直到她提醒才想起", affection: -8, expression: "angry", response: "柳如煙看著你，語氣明顯失望。「你昨天明明答應我了……算了，我自己再研究看看。」她把題目收回去。" }
        ]
    },
    {
        name: "柳如煙",
        background: "classroom",
        text: "解完題目後，柳如煙忽然問你：「如果有一天朋友誤會了你，你會怎麼做？」她看起來不像是在問課本上的問題。",
        choices: [
            { text: "說明溝通的重要，也願意聽對方說", affection: 6, expression: "happy", response: "柳如煙安靜地聽著，最後點了點頭。「我也覺得，至少應該先聽對方說完。」她像是把你的話記在心裡。", special: "honest_communication" },
            { text: "說不爽就不要再當朋友", affection: -6, expression: "angry", response: "柳如煙皺起眉頭。「可是有時候誤會不一定是故意的吧？什麼都不說就放棄，未免太可惜了。」" }
        ]
    },
    {
        name: "旁白",
        background: "hallway", 
        text: "某天下午，你無意間聽見其他同學談論柳如煙的事情。內容並不完整，你也不知道事情的真相。",
        choices: [
            { text: "不跟著傳話，直接向她確認", affection: 7, expression: "happy", response: "柳如煙聽完後，神情逐漸放鬆。「謝謝你願意先問我，而不是直接相信別人說的話。」她慢慢把事情的經過告訴你。", special: "trust" },
            { text: "沒弄清楚就跟著別人議論她", affection: -10, expression: "angry", response: "柳如煙得知後，生氣地看著你。「你連事情都沒弄清楚，就跟著別人講我？」她轉身離開，暫時不想和你說話。" }
        ]
    },
    {
        name: "柳如煙",
        background: "hallway",
        text: "隔天，柳如煙仍然有些在意昨天的事情。你們在走廊碰見，她停下腳步，似乎在等你先開口。",
        choices: [
            { text: "真誠道歉，承認自己沒有查清楚", affection: 7, expression: "normal", response: "柳如煙沉默了一會兒，才說：「我還是有點在意，但謝謝你願意道歉。希望下次你能先問清楚。」她沒有立刻恢復笑容，卻願意聽你說完。", special: "sincere_apology" },
            { text: "覺得她太小題大作，反過來怪她", affection: -10, expression: "angry", response: "柳如煙的表情冷了下來。「你到現在還覺得是我的問題嗎？我不想再談了。」她轉身離開。" }
        ]
    },
    {
        name: "旁白",
        background: "rainy_school",
        text: "放學時，天空突然下起大雨。柳如煙站在走廊，看著雨水打在地面上。她翻了翻書包，才發現自己忘了帶傘。",
        choices: [
            { text: "詢問她的想法，提議一起等雨停", affection: 6, expression: "happy", response: "柳如煙想了想，點頭說：「好啊，反正雨也很大。」你們站在走廊，一開始只是看雨，後來才慢慢聊起生活中的小事。" },
            { text: "不告而別，讓她自己想辦法", affection: -3, expression: "normal", response: "你收拾好東西先行離開。柳如煙看著你離去的方向，輕輕嘆了口氣，接著拿出手機查看公車時間。" }
        ]
    },
    {
        name: "柳如煙",
        background: "rainy_school",
        text: "雨勢漸漸變小。柳如煙看著你，像是猶豫了很久，才小聲說：「其實，跟你相處的這段時間，我覺得自己慢慢比較自在了。」",
        choices: [
            { text: "告訴她自己也很珍惜這段友誼", affection: 7, expression: "happy", response: "柳如煙露出有些害羞的笑容。「嗯……那我們以後也繼續好好相處吧。」她看向雨停後的天空，語氣比以前柔和許多。", special: "mutual_trust" },
            { text: "立刻逼問她是不是喜歡自己", affection: -5, expression: "angry", response: "柳如煙嚇了一跳，接著皺起眉頭。「我只是想好好跟你相處，你為什麼要突然逼我回答這種問題？」她需要時間整理自己的心情。" }
        ]
    },
    {
        name: "旁白",
        background: "event_classroom",
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
