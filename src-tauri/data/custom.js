window.addEventListener("DOMContentLoaded",()=>{const t=document.createElement("script");t.src="https://www.googletagmanager.com/gtag/js?id=G-W5GKHM0893",t.async=!0,document.head.appendChild(t);const n=document.createElement("script");n.textContent="window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-W5GKHM0893');",document.body.appendChild(n)});function waitDomReady(cb) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cb);
    } else cb();
}
waitDomReady(()=>{
    // ==================== ★ 开屏动画模块（气球粒子 + 动态效果）★ ====================
    (function splashScreen(){
        const SPLASH_KEY = 'hhkan_splash_played';
        // 同一会话内只播放一次（sessionStorage）；跨会话每次进入都播放可改为 localStorage
        if(sessionStorage.getItem(SPLASH_KEY) === '1') return;
        sessionStorage.setItem(SPLASH_KEY, '1');
        const SITE = 'https://www.hhkan0.com';
        // ---- 构建 DOM ----
        const mask = document.createElement('div');
        mask.id = 'hhkan-splash-mask';
        // 预连接目标站点（兼顾动画展示期的网络预热）
        if(!document.querySelector('link[href="https://www.hhkan0.com"][rel="preconnect"]')){
            const pc = document.createElement('link');
            pc.rel='preconnect'; pc.href='https://www.hhkan0.com'; pc.crossOrigin='anonymous';
            document.head.appendChild(pc);
        }
        mask.innerHTML = `
        <div class="splash-bg">
            <div class="splash-glow"></div>
            <div class="splash-stars" id="splash-stars"></div>
            <div class="splash-meteors" id="splash-meteors"></div>
            <div class="splash-balloons" id="splash-balloons"></div>
        </div>
        <div class="splash-content">
            <div class="splash-logo">
                <span class="splash-logo-icon">🎬</span>
                <span class="splash-logo-text" id="splash-logo-text"></span>
            </div>
            <div class="splash-sub" id="splash-sub"></div>
            <div class="splash-url" id="splash-url"></div>
            <div class="splash-progress">
                <div class="splash-progress-bar" id="splash-progress-bar"></div>
            </div>
            <div class="splash-tip" id="splash-tip">正在为您准备精彩内容…</div>
        </div>
        `;
        document.documentElement.appendChild(mask);
        const logoText = mask.querySelector('#splash-logo-text');
        const splashSub = mask.querySelector('#splash-sub');
        const splashUrl = mask.querySelector('#splash-url');
        const progressBar = mask.querySelector('#splash-progress-bar');
        const splashTip = mask.querySelector('#splash-tip');
        const balloonsHost = mask.querySelector('#splash-balloons');
        const particlesHost = mask.querySelector('#splash-stars');
        const meteorsHost = mask.querySelector('#splash-meteors');
        // ---- 打字机效果：打出站点名 ----
        const siteLabel = '好好看';
        let ti = 0;
        const typeTimer = setInterval(()=>{
            ti++;
            logoText.textContent = siteLabel.slice(0, ti);
            if(ti >= siteLabel.length){ clearInterval(typeTimer); }
        }, 180);
        // 副标题逐字
        const subText = '欢迎来到您的专属影视空间';
        let si = 0;
        const subTimer = setInterval(()=>{
            si++;
            splashSub.textContent = subText.slice(0, si);
            if(si >= subText.length){ clearInterval(subTimer); }
        }, 90);
        // URL 字符逐个显现
        let ui = 0;
        const urlTimer = setInterval(()=>{
            ui++;
            splashUrl.textContent = SITE.slice(0, ui);
            if(ui >= SITE.length){ clearInterval(urlTimer); }
        }, 35);
        // ---- 气球生成（随机颜色、大小、左右飘动） ----
        const balloonColors = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#ff7675','#74b9ff','#ffeaa7'];
        const balloonCount = 18;
        for(let i=0;i<balloonCount;i++){
            const b = document.createElement('div');
            b.className = 'splash-balloon';
            const size = 34 + Math.random()*30; // 34~64
            const color = balloonColors[Math.floor(Math.random()*balloonColors.length)];
            const left = Math.random()*92; // 0~92vw
            const delay = Math.random()*2.2;
            const dur = 4 + Math.random()*4; // 4~8s
            const sway = 20 + Math.random()*40; // 左右飘幅
            const swayDur = 2 + Math.random()*3;
            b.style.cssText = `
                left:${left}vw;
                width:${size}px;height:${size*1.18}px;
                background:radial-gradient(circle at 32% 30%, rgba(255,255,255,0.55), ${color} 60%, ${color} 100%);
                box-shadow:inset -4px -6px 10px rgba(0,0,0,0.18), 0 6px 14px rgba(0,0,0,0.25);
                animation: balloonRise ${dur}s ${delay}s ease-out forwards, balloonSway ${swayDur}s ${delay}s ease-in-out infinite alternate;
                --sway:${sway}px;
            `;
            // 气球绳
            const string = document.createElement('span');
            string.className='splash-balloon-string';
            b.appendChild(string);
            balloonsHost.appendChild(b);
        }
        // ---- 背景星星（大小/亮度随机，闪烁） ----
        const starCount = 60;
        for(let i=0;i<starCount;i++){
            const st = document.createElement('span');
            st.className='splash-star';
            const sz = (Math.random()<0.75 ? 1+Math.random()*2 : 3+Math.random()*3);
            const op = (0.45+Math.random()*0.55).toFixed(2);
            st.style.cssText = `
                left:${Math.random()*100}vw;
                top:${Math.random()*100}vh;
                width:${sz}px;height:${sz}px;
                opacity:${op};
                animation: starTwinkle ${2+Math.random()*4}s ${Math.random()*3}s ease-in-out infinite alternate;
            `;
            particlesHost.appendChild(st);
        }
        // ---- 流星（周期性从随机位置划过） ----
        const meteorCount = 5;
        for(let i=0;i<meteorCount;i++){
            const m = document.createElement('span');
            m.className='splash-meteor';
            const top = Math.random()*45;
            const delay = Math.random()*4;
            const dur = 2.2+Math.random()*1.8;
            const len = 90+Math.random()*90;
            m.style.cssText = `
                top:${top}vh;
                --len:${len}px;
                animation: meteorFall ${dur}s ${delay}s ease-in infinite;
            `;
            meteorsHost.appendChild(m);
        }
        // ---- 进度条 ----
        let progress = 0;
        const totalDuration = 5200; // 动画总时长 ms
        const progTimer = setInterval(()=>{
            progress += 2 + Math.random()*4;
            if(progress > 100) progress = 100;
            progressBar.style.width = progress+'%';
            if(progress >= 100){ clearInterval(progTimer); }
        }, totalDuration/50);
        // ---- 提示语轮换 ----
        const tips = ['正在为您准备精彩内容…','加载影视资源中…','气球升空，好戏即将开场 🎉','即将进入 好好看 ~'];
        let tipIdx = 0;
        const tipTimer = setInterval(()=>{
            tipIdx = (tipIdx+1)%tips.length;
            splashTip.style.opacity = '0';
            setTimeout(()=>{ splashTip.textContent = tips[tipIdx]; splashTip.style.opacity='1'; }, 300);
        }, 1400);
        // ---- 结束：淡出并移除 ----
        const finish = ()=>{
            clearInterval(typeTimer);clearInterval(subTimer);clearInterval(urlTimer);
            clearInterval(progTimer);clearInterval(tipTimer);
            progressBar.style.width='100%';
            mask.classList.add('splash-fadeout');
            setTimeout(()=>{ mask.remove(); }, 700);
        };
        setTimeout(finish, totalDuration);
    })();
    // ==================== 开屏动画模块结束 ====================
    const BAR_HEIGHT = 28;
    const APP_LINK = "https://dl.hhkan0.com/";
    let css = null;
    let topBar = null;
    let observer = null;
    let observerTimer = null;
// ========== 播放器设置全局状态（持久化） ==========
const PLAYER_SETTING_KEY = "pake_player_settings";
function getPlayerSettings(){
    const def = {
        skipIntro: 0,
        skipOutro: 0,
        videoFit: "default"
    }
    const str = localStorage.getItem(PLAYER_SETTING_KEY);
    if(!str) return {...def};
    try{
        return {...def, ...JSON.parse(str)};
    }catch(e){
        return {...def};
    }
}
function savePlayerSettings(obj){
    localStorage.setItem(PLAYER_SETTING_KEY, JSON.stringify({...getPlayerSettings(), ...obj}));
}
// 播放器逻辑
let videoObserver = null;
let handledVideoSet = new WeakSet();
function applyVideoFit(videoEl, fitMode){
    // 本地播放器的视频不受播放器设置影响，保持自身样式
    if(videoEl.closest && videoEl.closest('#local-player-mask')) return;
    const map = {
        "default"  :"contain",  // 默认：保持比例，留黑边
        "original" :"none",     // 原始：不缩放，按视频原始尺寸显示
        "stretch"  :"fill",     // 拉伸：拉伸填满容器（可能变形）
        "fill"     :"cover",    // 填充：裁剪填满容器（保持比例）
        "16:9"     :"contain",  // 16:9 画幅
        "4:3"      :"contain"   // 4:3 画幅
    }
    videoEl.style.objectFit = map[fitMode] ?? "contain";
    const parent = videoEl.parentElement;
    if(fitMode === "16:9"){
        parent.style.aspectRatio = "16/9";
    }else if(fitMode === "4:3"){
        parent.style.aspectRatio = "4/3";
    }else{
        parent.style.aspectRatio = "";
    }
}
function bindVideoPlayer(videoEl){
    if(handledVideoSet.has(videoEl)) return;
    // 本地播放器的视频不受播放器设置（画面比例/跳过片头片尾）影响
    if(videoEl.closest && videoEl.closest('#local-player-mask')){
        handledVideoSet.add(videoEl); // 标记已处理，避免重复判断
        return;
    }
    handledVideoSet.add(videoEl);
    const setting = getPlayerSettings();
    applyVideoFit(videoEl, setting.videoFit);
    videoEl.addEventListener('timeupdate', ()=>{
        const s = getPlayerSettings();
        const cur = videoEl.currentTime;
        const dur = videoEl.duration;
        if(!dur || isNaN(dur)) return;
        // 跳过片头：仅当片头时长小于视频总时长时才生效，避免短视频被误跳
        if(s.skipIntro > 0 && s.skipIntro < dur && cur < s.skipIntro){
            videoEl.currentTime = s.skipIntro;
        }
        // 跳过片尾：仅当片尾时长小于视频总时长时生效；
        // 同时当剩余时间进入片尾区间时跳到末尾前 0.01s 触发结束
        if(s.skipOutro > 0 && s.skipOutro < dur && (dur - cur) <= s.skipOutro){
            videoEl.currentTime = dur - 0.01;
        }
    })
}
function watchVideoElements(){
    if(videoObserver) videoObserver.disconnect();
    videoObserver = new MutationObserver(()=>{
        document.querySelectorAll('video').forEach(v=>{
            bindVideoPlayer(v);
        });
        updateFloatBallVisibility();
        // 视频元素出现 = 已进入播放页，触发一次自动检测
        if(hasVideoElement()){
            clearTimeout(watchVideoElements._detectTimer);
            watchVideoElements._detectTimer = setTimeout(autoDetectAndNotify, 600);
        }
    })
    videoObserver.observe(document.body, {childList:true, subtree:true});
    document.querySelectorAll('video').forEach(v=>{
        bindVideoPlayer(v);
    });
    updateFloatBallVisibility();
    // 初始若有视频（如页面加载即带播放器），也检测一次
    if(hasVideoElement()){
        setTimeout(autoDetectAndNotify, 800);
    }
}
// ===================== 【网页性能加速模块】开始 =====================
(function performanceBoost(){
    const preDomains = [
        "https://www.hhkan0.com",
        "https://dl.hhkan0.com"
    ];
    preDomains.forEach(domain=>{
        if(!document.querySelector(`link[href="${domain}"][rel="preconnect"]`)){
            const preConnect = document.createElement('link');
            preConnect.rel = "preconnect";
            preConnect.href = domain;
            preConnect.crossOrigin = "anonymous";
            document.head.appendChild(preConnect);
            const dnsPre = document.createElement('link');
            dnsPre.rel = "dns-prefetch";
            dnsPre.href = domain;
            document.head.appendChild(dnsPre);
        }
    });
    const perfStyle = document.createElement('style');
    perfStyle.textContent = `
        * { scroll-behavior: auto !important; }
        *,*::before,*::after { animation-delay: 0s !important; transition-delay:0s !important; }
        .lazy-offscreen { content-visibility: auto; contain: layout paint; }
        img { content-visibility:auto; }
    `;
    document.head.appendChild(perfStyle);
    function optimizeImages(){
        document.querySelectorAll('img').forEach(img=>{
            if(!img.loading){
                img.loading = "lazy";
            }
            const rect = img.getBoundingClientRect();
            if(rect.top < window.innerHeight + 500){
                img.fetchpriority = "high";
            }else{
                img.fetchpriority = "low";
            }
        })
    }
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options){
        if((type === 'scroll' || type === 'touchmove' || type === 'touchstart') && typeof options !== "object"){
            options = { passive:true };
        }
        return originalAddEventListener.call(this, type, listener, options);
    }
    window.idleRun = function(cb, timeout = 2000){
        if(window.requestIdleCallback){
            requestIdleCallback(cb, {timeout});
        }else{
            setTimeout(cb, 10);
        }
    }
    window.debounce = function(fn, delay = 250){
        let timer;
        return (...args)=>{
            clearTimeout(timer);
            timer = setTimeout(()=>fn.apply(this,args), delay);
        }
    }
    window.idleRun(()=>optimizeImages());
    const imgObs = new MutationObserver(window.debounce(()=>optimizeImages(),400));
    imgObs.observe(document.body, {childList:true, subtree:true});
})();
// ===================== 【网页性能加速模块】结束 =====================
// ==================== 海报缓存管理 ====================
function getPosterCache(){
    const str = localStorage.getItem("poster_cache");
    return str ? JSON.parse(str) : {};
}
function setPosterCache(title,url){
    const cache = getPosterCache();
    cache[title] = url;
    localStorage.setItem("poster_cache",JSON.stringify(cache));
}
function getTitleHashId(str){
    let hash = 0;
    for(let i=0;i<str.length;i++){
        hash = ((hash <<5)-hash)+str.charCodeAt(i);
        hash |=0;
    }
    return Math.abs(hash) % 1000;
}
function shuffleArray(arr) {
    const copy = [...arr];
    for(let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
function sortByScoreDesc(arr){
    return [...arr].sort((a,b)=>{
        return parseFloat(b.doubanScore) - parseFloat(a.doubanScore);
    })
}
// ==================== ★ 每日零点自动更新机制 ★ ====================
function getTodayStr(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getNextMidnight(){
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}
function scheduleDailyRefresh(){
    const msToMidnight = getNextMidnight();
    console.log(`[每日推荐] 距离下次自动更新还有 ${Math.round(msToMidnight/1000/60)} 分钟`);
    setTimeout(()=>{
        // 零点到了，清除所有推荐缓存，生成全新名单
        localStorage.removeItem("rec_day");
        localStorage.removeItem("rec_data");
        localStorage.removeItem("rec_random_pool");
        console.log('[每日推荐] 🌙 零点已到，推荐名单已自动刷新！');
        // 如果推荐弹窗当前是打开的，自动刷新内容
        const existingModal = document.querySelector('#recommend-modal-mask');
        if(existingModal){
            openRecommendModal();
        }
        // 递归调度下一次零点
        scheduleDailyRefresh();
    }, msToMidnight + 1000);
}
// 页面加载时启动每日零点调度
scheduleDailyRefresh();
// 同时用 setInterval 做双保险检测（防止休眠导致 setTimeout 漂移）
setInterval(()=>{
    const today = getTodayStr();
    const cacheDay = localStorage.getItem("rec_day");
    if(cacheDay && cacheDay !== today){
        localStorage.removeItem("rec_day");
        localStorage.removeItem("rec_data");
        localStorage.removeItem("rec_random_pool");
        console.log('[每日推荐] 日期变更检测：推荐名单已自动更新');
    }
}, 60000);
// ==================== ★ 从 hhkan0.com 动态获取影片列表 ★ ====================
/**
 * 通过抓取 hhkan0.com 的分类页面，动态获取影片列表
 * 支持电影、电视剧、动漫、综艺、短剧五大分类
 */
async function fetchMoviesFromSite(category, page = 1){
    const categoryMap = {
        movie: '1',      // 电影
        series: '2',     // 电视剧
        anime: '4',      // 动漫
        variety: '3',    // 综艺
        shortDrama: '5'  // 短剧
    };
    const catId = categoryMap[category] || '1';
    const url = `https://www.hhkan0.com/map/${catId}-${page}.html`;
    return new Promise((resolve) => {
        const cbName = '__hhkan_jsonp_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
        try {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 8000;
            xhr.open('GET', url, true);
            xhr.onload = function(){
                if(xhr.status === 200){
                    const html = xhr.responseText;
                    const items = parseMovieListFromHtml(html, category);
                    resolve(items);
                }else{
                    resolve([]);
                }
            };
            xhr.onerror = ()=> resolve([]);
            xhr.ontimeout = ()=> resolve([]);
            xhr.send();
        } catch(e){
            resolve([]);
        }
    });
}
/**
 * 从 hhkan0.com 首页或分类页 HTML 中解析影片列表
 */
function parseMovieListFromHtml(html, category){
    const items = [];
    const seen = new Set();
    // 方法1：匹配 a 标签中的 title 属性
    const titlePattern = /<a[^>]+href="[^"]*\/(?:movie|detail|tv|anime|variety|short|play)\/(\d+)[^"]*"[^>]*title="([^"]{2,40})"[^>]*>/gi;
    let m;
    while((m = titlePattern.exec(html)) !== null){
        const id = m[1];
        const title = m[2].trim();
        if(!seen.has(title) && title.length > 1 && title.length < 40){
            seen.add(title);
            items.push({
                title: title,
                id: id,
                fullUrl: `https://www.hhkan0.com/movie/${id}.html`,
                doubanScore: (Math.random() * 2 + 6).toFixed(1),
                category: category
            });
        }
    }
    // 方法2：如果没有找到 title 属性，从链接文本提取
    if(items.length < 5){
        const textPattern = /<a[^>]+href="[^"]*\/(?:movie|detail|tv|anime|variety|short)\/(\d+)\.html"[^>]*>([^<]{2,30})<\/a>/gi;
        while((m = textPattern.exec(html)) !== null){
            const id = m[1];
            const title = m[2].trim().replace(/<[^>]+>/g,'');
            if(/^[\u4e00-\u9fa5\w\s：:]+$/.test(title) && !seen.has(title) && title.length > 1){
                seen.add(title);
                items.push({
                    title: title,
                    id: id,
                    fullUrl: `https://www.hhkan0.com/movie/${id}.html`,
                    doubanScore: (Math.random() * 2 + 6).toFixed(1),
                    category: category
                });
            }
        }
    }
    return items.slice(0, 40);
}
/**
 * 通过本站搜索接口获取影片
 */
async function searchSiteForMovies(keyword, category){
    const searchUrl = `https://www.hhkan0.com/search.php?searchword=${encodeURIComponent(keyword)}`;
    return new Promise((resolve) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 6000;
            xhr.open('GET', searchUrl, true);
            xhr.onload = function(){
                if(xhr.status === 200){
                    const html = xhr.responseText;
                    const items = parseMovieListFromHtml(html, category);
                    resolve(items);
                }else{
                    resolve([]);
                }
            };
            xhr.onerror = ()=> resolve([]);
            xhr.ontimeout = ()=> resolve([]);
            xhr.send();
        } catch(e){
            resolve([]);
        }
    });
}
/**
 * 从 hhkan0.com 首页热门推荐区域提取影片
 */
async function fetchHomePageMovies(){
    return new Promise((resolve) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.timeout = 8000;
            xhr.open('GET', 'https://www.hhkan0.com/', true);
            xhr.onload = function(){
                if(xhr.status === 200){
                    const html = xhr.responseText;
                    const allItems = [];
                    const sections = {
                        movie: ['电影', '院线', '热映'],
                        series: ['电视剧', '剧集', '连续剧'],
                        anime: ['动漫', '动画'],
                        variety: ['综艺'],
                        shortDrama: ['短剧', '微剧']
                    };
                    const result = {};
                    for(const [cat, keywords] of Object.entries(sections)){
                        const items = [];
                        const seen = new Set();
                        keywords.forEach(kw => {
                            const idx = html.indexOf(kw);
                            if(idx > 0){
                                const block = html.substring(Math.max(0, idx-500), idx + 3000);
                                const pattern = /href="[^"]*\/(?:movie|detail|tv|anime|variety|short)\/(\d+)\.html"[^>]*title="([^"]{2,40})"/gi;
                                let m;
                                while((m = pattern.exec(block)) !== null){
                                    const id = m[1];
                                    const title = m[2].trim();
                                    if(!seen.has(title)){
                                        seen.add(title);
                                        items.push({
                                            title: title,
                                            id: id,
                                            fullUrl: `https://www.hhkan0.com/movie/${id}.html`,
                                            doubanScore: (Math.random() * 2 + 6).toFixed(1),
                                            category: cat
                                        });
                                    }
                                }
                            }
                        });
                        result[cat] = items.slice(0, 20);
                        allItems.push(...result[cat]);
                    }
                    resolve(result);
                }else{
                    resolve(null);
                }
            };
            xhr.onerror = ()=> resolve(null);
            xhr.ontimeout = ()=> resolve(null);
            xhr.send();
        } catch(e){
            resolve(null);
        }
    });
}
/**
 * 生成每日随机推荐名单
 * 优先从 hhkan0.com 动态获取，失败时回退到内置列表
 */
async function getDailyRecommend(){
    const today = getTodayStr();
    const cacheDay = localStorage.getItem("rec_day");
    const cacheData = localStorage.getItem("rec_data");
    // 如果缓存有效且是今天的，直接返回
    if(cacheDay === today && cacheData){
        try{
            return JSON.parse(cacheData);
        }catch(e){
            // 解析失败，重新生成
        }
    }
    console.log(`[每日推荐] 正在从 hhkan0.com 获取 ${today} 的推荐名单...`);
    // 尝试从网站动态获取
    let siteData = null;
    try{
        siteData = await fetchHomePageMovies();
    }catch(e){
        console.log('[每日推荐] 网站获取失败，使用备用方案');
    }
    let newRec;
    if(siteData && (siteData.movie?.length > 0 || siteData.series?.length > 0)){
        console.log('[每日推荐] ✅ 网站数据获取成功');
        newRec = {
            movie: shuffleArray(siteData.movie).slice(0, 20),
            series: shuffleArray(siteData.series).slice(0, 20),
            anime: shuffleArray(siteData.anime || []).slice(0, 20),
            variety: shuffleArray(siteData.variety || []).slice(0, 20),
            shortDrama: shuffleArray(siteData.shortDrama || []).slice(0, 20)
        };
    }else{
        console.log('[每日推荐] ⚠️ 使用本地随机生成方案');
        newRec = generateFallbackRecommend();
    }
    // 确保每类至少有数据
    const categories = ['movie','series','anime','variety','shortDrama'];
    categories.forEach(cat => {
        if(!newRec[cat] || newRec[cat].length === 0){
            newRec[cat] = generateFallbackRecommend()[cat];
        }
    });
    localStorage.setItem("rec_day", today);
    localStorage.setItem("rec_data", JSON.stringify(newRec));
    console.log(`[每日推荐] ✅ 已生成 ${today} 的推荐名单（每天00:00自动更新）`);
    return newRec;
}
/**
 * 备用推荐列表（网站不可达时使用）
 * 每次调用生成不同的随机组合
 */
function generateFallbackRecommend(){
    const seedPool = {
        movie: [
            "流浪地球3","封神第二部","哪吒之魔童闹海","唐人街探案4","维和防暴队",
            "解密","射雕英雄传：侠之大者","误判","749局","酱园弄悬案",
            "你好李焕英","满江红","长津湖","消失的她","八角笼中",
            "第二十条","热辣滚烫","飞驰人生2","志愿军：雄兵出击","三大队",
            "流浪地球2","奥本海默","沙丘2","哥斯拉-1.0","封神第一部",
            "无名","悬崖之上","我不是药神","哪吒之魔童降世","星际穿越",
            "泰坦尼克号","盗梦空间","复仇者联盟5","金刚狼4","金陵十三钗",
            "湄公河行动","红海行动","战狼2","我和我的祖国","你好世界"
        ],
        series: [
            "庆余年第三季","琅琊榜3","凡人修仙传真人版","长安的荔枝","国色芳华",
            "白月梵星","永夜星河","度华年","大奉打更人","云之羽",
            "狂飙","人世间","三体","漫长的季节","隐秘的角落",
            "沉默的真相","庆余年第一季","知否知否应是绿肥红瘦","甄嬛传","琅琊榜",
            "莲花楼","梦华录","苍兰诀","风吹半夏","山海情",
            "觉醒年代","伪装者","父母爱情","大宋少年志2","古相思曲",
            "狂飙2","庆余年第二季","显微镜下的大明","唐朝诡事录2","锦绣安宁",
            "宁安如梦2","我的人间烟火","以家人之名","三十而已","警察荣誉"
        ],
        anime: [
            "斗破苍穹年番","遮天","仙逆","沧元图","完美世界",
            "画江湖之不良人7","灵笼第二季","凡人修仙传","一人之下第五季","狐妖小红娘",
            "咒术回战","鬼灭之刃","海贼王","进击的巨人","间谍过家家",
            "葬送的芙莉莲","蓝色监狱","链锯人","辉夜大小姐想让我告白","夏目友人帐",
            "灵笼第一季","雾山五行","罗小黑战记","全职高手","魔道祖师",
            "天官赐福","镖人","红小豆","刺客伍六七","中国奇谭",
            "时光代理人","斗罗大陆","万古神帝","神印王座","武庚纪"
        ],
        variety: [
            "奔跑吧第12季","极限挑战第10季","向往的生活第8季","中餐厅第8季","爸爸去哪儿第7季",
            "歌手2025","我是歌手第10季","中国好声音2025","蒙面唱将猜猜猜第8季","声生不息第3季",
            "王牌对王牌第9季","天天向上2025","快乐大本营2025","跨界歌王第6季","脱口秀大会第6季",
            "吐槽大会第8季","一年一度喜剧大赛3","戏剧新生活第2季","这！就是街舞第6季","创造营2025",
            "乘风破浪的姐姐5","妻子的浪漫旅行第7季","再见爱人第4季","花儿与少年第7季","名侦探学院第8季",
            "密室大逃脱第7季","明星大侦探第9季","我们的歌第6季","听说很好吃第4季","种地吧第3季"
        ],
        shortDrama: [
            "我在八零当后妈","黑莲花攻略手册","太子妃升职记2","招惹","虚颜",
            "拜托了，别宠我","一夜新娘","千金丫环","锁爱三生","致命主妇",
            "闪婚后傅先生马甲藏不住","厉总，你找错夫人了","龙王归来","战神归来","豪门少奶奶",
            "替身新娘","错嫁良缘","重生之都市修仙","霸道总裁的小娇妻","王妃万福",
            "陛下，臣妾知错了","摄政王的冷妃","神医弃妃","凤逆天下","九重紫",
            "宁安如梦","墨雨云间","庆余年短剧版","甄嬛传短剧版","琅琊榜短剧版"
        ]
    };
    const result = {};
    for(const [cat, pool] of Object.entries(seedPool)){
        const shuffled = shuffleArray(pool);
        const count = 8 + Math.floor(Math.random() * 13); // 8~20
        result[cat] = shuffled.slice(0, count).map(title => ({
            title: title,
            id: String(Math.abs(hashCode(title)) % 99999),
            fullUrl: `https://www.hhkan0.com/search.php?searchword=${encodeURIComponent(title)}`,
            doubanScore: (6 + Math.random() * 3).toFixed(1),
            category: cat
        }));
    }
    return result;
}
function hashCode(str){
    let hash = 0;
    for(let i=0;i<str.length;i++){
        hash = ((hash <<5)-hash)+str.charCodeAt(i);
        hash |=0;
    }
    return hash;
}
/**
 * 统一本站搜索逻辑（用于推荐列表点击搜索）
 */
let fetchPosterQueueRunning = false;
let searchTimerRef = null;
let recommendModalDom = null;
async function innerSearch(title, silentMode = false){
    if(!silentMode){
        const mask = document.querySelector('#recommend-modal-mask');
        if(mask) mask.remove();
        recommendModalDom = null;
    }
    const searchInputSelectors = [
        'input[name="q"]', 'input[type="search"]', '#search-input',
        '#search-key', 'input[placeholder*="搜索"]', '.search-input',
        '.search-box input', 'header input[type="text"]',
        '.header-search input', 'input.search'
    ];
    let inputEl = null;
    for(const sel of searchInputSelectors){
        inputEl = document.querySelector(sel);
        if(inputEl) break;
    }
    if(!inputEl){
        if(!silentMode) console.log("未找到本站搜索框");
        return;
    }
    inputEl.value = title.trim();
    inputEl.dispatchEvent(new Event('input', {bubbles:true}));
    inputEl.dispatchEvent(new Event('change', {bubbles:true}));
    inputEl.focus();
    if(silentMode){
        await new Promise(resolve=> setTimeout(resolve,1200));
        const posterSelectors = [
            '.search-list img', '.vod-list img', '.list-item img',
            '.search-result img', '.search-results img', '.result-list img',
            '.video-list img', '.item-list img', '.vod-item img',
            '.search-vod img', '.search-box img', '.ss-list img',
            '.search-img img', '.vod-img img',
            'a[href*="play"] img', 'a[href*="video"] img',
            'a[href*="movie"] img', 'a[href*="detail"] img',
            '.search a img', '.results a img', '.list a img',
            'img[src*="cover"]', 'img[src*="poster"]',
            'img[src*="pic"]', 'img[src*="img"]', 'img[src*="thumb"]'
        ];
        for(const ps of posterSelectors){
            const firstImg = document.querySelector(ps);
            if(firstImg && firstImg.src && !firstImg.src.includes('icon') && !firstImg.src.includes('logo')){
                setPosterCache(title, firstImg.src);
                break;
            }
        }
        return;
    }
    let searchTimer = setInterval(()=>{
        const searchBtnSelectors = ['button[type="submit"]', '.search-btn', '#search-btn', 'input[type="submit"]', '.btn-search'];
        let searchBtn = null;
        for(const ss of searchBtnSelectors){
            searchBtn = document.querySelector(ss);
            if(searchBtn) break;
        }
        if(searchBtn){
            searchBtn.click();
            console.log("已自动点击搜索按钮：",title);
            clearInterval(searchTimer);
            searchTimerRef = null;
            setTimeout(()=>{
                const posterSelectors = [
                    '.search-list img', '.vod-list img', '.list-item img',
                    '.search-result img', '.search-results img', '.result-list img',
                    '.video-list img', '.item-list img', '.vod-item img'
                ];
                for(const ps of posterSelectors){
                    const firstImg = document.querySelector(ps);
                    if(firstImg && firstImg.src){
                        setPosterCache(title, firstImg.src);
                        break;
                    }
                }
            },1400);
        }
    }, 200);
    searchTimerRef = searchTimer;
    setTimeout(()=>{
        clearInterval(searchTimer);
        searchTimerRef = null;
    },8000);
}
async function startFetchPosterQueue(itemList){
    if(fetchPosterQueueRunning) return;
    fetchPosterQueueRunning = true;
    const posterCache = getPosterCache();
    const needFetch = itemList.filter(item=> !posterCache[item.title]);
    console.log("需要抓取封面数量：", needFetch.length);
    for(const item of needFetch){
        if(!document.querySelector("#recommend-modal-mask")) break;
        await innerSearch(item.title, true);
        await new Promise(resolve=> setTimeout(resolve,2200));
    }
    fetchPosterQueueRunning = false;
}
function closeRecommendModal(){
    const mask = document.querySelector('#recommend-modal-mask');
    if(mask) mask.remove();
    recommendModalDom = null;
    fetchPosterQueueRunning = false;
    if(searchTimerRef){
        clearInterval(searchTimerRef);
        searchTimerRef = null;
    }
    // 弹窗关闭后恢复悬浮球显示，并重新对齐到视频框左上角
    const ball = document.querySelector('#hhkan-float-ball');
    if(ball){
        ball.classList.remove('fb-hidden-by-modal');
        ball.style.display = '';
        updateFloatBallVisibility();
    }
}
// ==================== 【弹窗优先级管理模块】开始 ====================
// 任务栏 / 悬浮球 各功能弹窗统一注册，按优先级互斥关闭：
// 打开新弹窗时，若已存在「优先级 >= 新弹窗」的弹窗，则本次打开被抑制（保留高优先级弹窗）；
// 否则关闭所有已开的、优先级低于本次弹窗的弹窗，再打开新弹窗。
const MODAL_REGISTRY = [
    { id: 'local-player-mask',  priority: 80 }, // 本地播放器（最优先，正在播放不应被关）
    { id: 'episode-modal-mask', priority: 70 }, // 选集/线路弹窗
    { id: 'player-setting-mask',priority: 60 }, // 播放设置
    { id: 'recommend-modal-mask',priority: 50 }, // 每日推荐
    { id: 'app-modal-mask',     priority: 40 }  // APP 下载
];
function getModalPriority(id){
    const m = MODAL_REGISTRY.find(x => x.id === id);
    return m ? m.priority : 0;
}
// 返回当前已打开弹窗中最高优先级（null 表示无弹窗）
function getTopOpenModal(){
    let top = null;
    MODAL_REGISTRY.forEach(m => {
        if(document.querySelector('#' + m.id)){
            if(!top || m.priority > top.priority) top = m;
        }
    });
    return top;
}
// 关闭指定 id 的弹窗（优先调用其专属 close 函数，避免资源泄漏；无专属 close 时直接 remove）
function closeModalById(id){
    if(id === 'recommend-modal-mask')      { try{ closeRecommendModal(); }catch(e){} return; }
    if(id === 'local-player-mask'){
        const c = document.querySelector('#lp-btn-close');
        if(c){ try{ c.click(); }catch(e){} return; }
    }
    const el = document.querySelector('#' + id);
    if(el) el.remove();
}
/**
 * 打开新弹窗前的统一闸门。
 * @param {string} newId  即将打开的弹窗 mask id
 * @returns {boolean} true  = 允许打开（调用方继续创建）；false = 被抑制（已有更高/同等优先级弹窗，本次不打开）
 */
function requestOpenModal(newId){
    const newPri = getModalPriority(newId);
    const top = getTopOpenModal();
    if(top && top.priority >= newPri && top.id !== newId){
        // 已有更高或同等优先级弹窗占据，本次打开被抑制
        console.log('[弹窗优先级] 抑制打开', newId, '，当前高优先级弹窗:', top.id);
        return false;
    }
    // 关闭所有已开的、优先级低于本次的弹窗
    MODAL_REGISTRY.forEach(m => {
        if(m.id === newId) return;
        if(document.querySelector('#' + m.id) && m.priority < newPri){
            console.log('[弹窗优先级] 关闭低优先级弹窗:', m.id, '以打开', newId);
            closeModalById(m.id);
        }
    });
    return true;
}
// ==================== 【弹窗优先级管理模块】结束 ====================
// ==================== 悬浮球 + 选集列表模块 ====================
const FLOAT_BALL_KEY = "hhkan_floatball_pos";
const SELECT_RECORD_KEY = "hhkan_select_record";
let globalPanelVisible = false;
function getSelectRecord(){
    const def = { lineIndex: 0, episodeNum: 0, lineName: '', episodeText: '', url: '' };
    try{
        const str = localStorage.getItem(SELECT_RECORD_KEY);
        if(str) return {...def, ...JSON.parse(str)};
    }catch(e){}
    return def;
}
function saveSelectRecord(record){
    localStorage.setItem(SELECT_RECORD_KEY, JSON.stringify({...getSelectRecord(), ...record}));
}
function hasVideoElement(){
    return !!document.querySelector('video');
}
function getVideoBounds(){
    const video = document.querySelector('video');
    if(video){
        const rect = video.getBoundingClientRect();
        if(rect.width > 0 && rect.height > 0){
            return rect;
        }
    }
    const playerSelectors = [
        '.dplayer', '.x-player', '.player', '.video-player',
        '.play-box', '.video-container', '.player-container',
        '#player', '#video', '#dplayer', '#xplayer'
    ];
    for(const sel of playerSelectors){
        const el = document.querySelector(sel);
        if(el){
            const rect = el.getBoundingClientRect();
            if(rect.width > 0 && rect.height > 0){
                return rect;
            }
        }
    }
    return null;
}
function getFloatBallPos(){
    const def = {left: window.innerWidth - 80, top: BAR_HEIGHT + 10, side: 'right'};
    try{
        const str = localStorage.getItem(FLOAT_BALL_KEY);
        if(str) return {...def, ...JSON.parse(str)};
    }catch(e){}
    return def;
}
function saveFloatBallPos(pos){
    localStorage.setItem(FLOAT_BALL_KEY, JSON.stringify(pos));
}
function isFullScreen(){
    return !!(document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.mozFullscreenElement ||
              document.msFullscreenElement);
}
function getFullscreenElement(){
    return document.fullscreenElement ||
           document.webkitFullscreenElement ||
           document.mozFullscreenElement ||
           document.msFullscreenElement ||
           null;
}
// ========== 选集跳转后自动全屏 ==========
const AUTO_FS_KEY = "hhkan_auto_fullscreen";
/**
 * 请求对播放器容器进入全屏
 * 优先对 video 父容器全屏（适配 DPlayer / xgplayer / 自定义播放器）
 */
function requestFullscreenOnVideo(){
    const video = document.querySelector('video');
    let targetEl =
        video?.parentElement ||
        document.querySelector('.dplayer,.x-player,.player,.video-player,.play-box,.video-container,.player-container') ||
        document.documentElement;
    if(!targetEl) return false;
    // 如果已经在全屏状态，无需重复操作
    if(getFullscreenElement()) return true;
    const requestFs =
        targetEl.requestFullscreen ||
        targetEl.webkitRequestFullscreen ||
        targetEl.mozRequestFullScreen ||
        targetEl.msRequestFullscreen;
    if(requestFs){
        try{
            requestFs.call(targetEl);
            return true;
        }catch(e){
            console.log('[自动全屏] 请求失败：', e);
            return false;
        }
    }
    return false;
}
/**
 * 尝试自动全屏（带重试机制，等待播放器渲染完成）
 */
function tryAutoFullscreen(maxRetries = 10, interval = 500){
    let retries = 0;
    const attempt = () => {
        // 检查是否需要自动全屏
        if(sessionStorage.getItem(AUTO_FS_KEY) !== "1"){
            return;
        }
        const video = document.querySelector('video');
        if(video && video.readyState >= 1){
            // 视频已加载，尝试全屏
            const success = requestFullscreenOnVideo();
            if(success){
                console.log('[自动全屏] ✅ 已自动进入全屏模式');
                sessionStorage.removeItem(AUTO_FS_KEY);
                return;
            }
        }
        // 重试
        retries++;
        if(retries < maxRetries){
            setTimeout(attempt, interval);
        }else{
            console.log('[自动全屏] ⚠️ 重试次数耗尽，放弃自动全屏');
            sessionStorage.removeItem(AUTO_FS_KEY);
        }
    };
    // 延迟一点开始，确保页面跳转后DOM已更新
    setTimeout(attempt, 300);
}
// ========== 透明计时器 ==========
let fadeTimer = null;
let isHovering = false;
function startFadeTimer(ball){
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(()=>{
        if(!isHovering && !isFullScreen()){
            ball.classList.add('fb-faded');
            ball.classList.remove('fb-visible');
        }
    }, 2500);
}
function cancelFadeTimer(){
    clearTimeout(fadeTimer);
}
// ========== 线路名称自动识别（适配 hhkan0.com 全部影视/线路）==========
// 策略：以实际检测到的线路序号为主（线路 N），并从原始 tab 名称/特征词中
// 自动推断质量标签（4K / 蓝光 / 高清 / 720P / 标清 / 播放快 / 香港加速 / 大陆加速），
// 不再依赖写死的固定映射，从而适配站点动态增减的任意线路。
function mapLineName(originalName, index){
    const idx = (index == null ? -1 : index) + 1; // 线路序号从 1 开始
    // 先剥离末尾拖带的集数数字（如 "FF线路 播放快/高清 32" -> "FF线路 播放快/高清"）
    let raw = (originalName || '').toString().trim().replace(/\s+/g,' ');
    raw = raw.replace(/\s+\d{1,4}\s*$/, '').trim();
    const lower = raw.toLowerCase();
    // 若原始名已是"线路N"这类纯编号占位（无实质信息），则按序号+特征自动命名
    const isPlaceholder = !raw ||
        /^线路\s*\d+$/.test(raw) ||
        /^线路$/.test(raw) ||
        /^默认线路$/.test(raw) ||
        /^play\s*\d*$/i.test(raw) ||
        /^server\s*\d*$/i.test(raw) ||
        /^source\s*\d*$/i.test(raw);
    // 从原始名提取可识别的特征标签（画质优先，命中即停止，避免降级）
    // 增强：支持 HD/正片/英语/HD中字/BD/TV/TC/CAM 等英文及中文画质词
    const tags = [];
    if(/\b4k\b|超清|秒播/.test(raw)) tags.push('4K');
    else if(/蓝光|blue|bd\b|\bblue\s*ray\b/.test(lower)) tags.push('蓝光');
    else if(/\bhd\b|高清|fhd/.test(lower)) tags.push('高清');
    else if(/720p/.test(lower)) tags.push('720P');
    else if(/标清|sd\b/.test(lower)) tags.push('标清');
    // 未识别到任何画质时，标记为"线路分类"，符合"识别不了就写成线路分类"
    if(tags.length === 0) tags.push('线路分类');
    if(/香港|hk\b/.test(lower)) tags.push('香港加速');
    else if(/中国大陆|大陆|cn\b|hn\b/.test(lower)) tags.push('大陆加速');
    else if(/加速|快|speed|ff\b/.test(lower)) tags.push('播放快');
    // 保留原始名中除"线路N/默认线路"之外的有意义前缀（如 "FF线路""XL线路""DB线路"等）
    let prefix = '';
    if(!isPlaceholder){
        prefix = raw.replace(/^\s*线路\s*\d+\s*[-:：]?\s*/, '')
                    .replace(/\s*[-:：]\s*线路\s*\d+\s*$/, '')
                    .trim();
        // 若清洗后只剩数字或空，视为无前缀
        if(!prefix || /^[\d\s]+$/.test(prefix)) prefix = '';
        // 若原始名本身就是"线路N"，视为占位
        if(/^线路\s*\d+$/.test(raw)) prefix = '';
    }
    // 组装名称：默认 "线路N"；有自定义前缀则 "前缀-线路N"；再追加画质标签
    let name = '线路' + idx;
    if(prefix){
        name = prefix + '-' + name;
    }
    // 去重：避免前缀已含同类词时重复
    const dedup = [];
    const seen = new Set();
    for(const t of tags){
        const key = t.replace(/加速$/,'');
        if(seen.has(key)) continue;
        seen.add(key); dedup.push(t);
    }
    const tagStr = dedup.join('/');
    // 若前缀已包含全部标签文字，则不再重复追加画质段
    if(prefix && dedup.every(t => prefix.indexOf(t) !== -1)) {
        name = prefix;
    } else {
        name = name + '-' + tagStr;
    }
    return name;
}
// ========== 电影页面检测 ==========
function isMoviePage(){
    const url = location.href.toLowerCase();
    if(/movie|film|电影/.test(url)) return true;
    const listSelectors = [
        '.module-play-list', '.play-list', '.episode-list', '.episode-list-box',
        '.anthology-list', '.num-list', '.play-box-list', '.video-list',
        '.ep-list', '.play-item-list', '.list-play', '.play-wrap'
    ];
    let totalEps = 0;
    for(const sel of listSelectors){
        const lists = document.querySelectorAll(sel);
        lists.forEach(list => {
            const links = list.querySelectorAll('a[href]');
            totalEps += links.length;
        });
    }
    if(totalEps <= 2 && totalEps > 0) return true;
    const pageText = document.body.innerText || '';
    if(!/选集|分集|剧集|第\d+集/.test(pageText) && totalEps <= 3) return true;
    return false;
}
// ========== 选集提取 ==========
function extractAllLines() {
    const lines = [];
    const seenKeys = new Set();
    const isMovie = isMoviePage();
    const tabSelectors = [
        '.module-tab-item', '.tab-item', '.play-source', '.source-tab',
        '.line-tab', '.play-line a', '.anthology-tab a', '.num-tab a',
        '.play-tab', '.server-tab', '.source-item', '.play-btn'
    ];
    const listSelectors = [
        '.module-play-list', '.play-list', '.episode-list', '.episode-list-box',
        '.anthology-list', '.num-list', '.play-box-list', '.video-list',
        '.ep-list', '.play-item-list', '.list-play', '.play-wrap'
    ];
    let tabs = [];
    for(const sel of tabSelectors){
        tabs = document.querySelectorAll(sel);
        if(tabs.length > 0) break;
    }
    let lists = [];
    for(const sel of listSelectors){
        lists = document.querySelectorAll(sel);
        if(lists.length > 0) break;
    }
    if(isMovie){
        // 电影也按真实线路 tab + 播放列表提取，使"路线/画质"与电视剧一致
        const currentUrl = location.href;
        // 清洗 tab 文本：剥离开头的"线路N"占位，避免与 mapLineName 生成的序号重复
        const cleanTabText = (t) => {
            let s = (t||'').trim().replace(/\s+/g,' ');
            s = s.replace(/^\s*线路\s*\d+\s*[-:：]?\s*/, '');
            return s;
        };
        if(tabs.length > 0 && lists.length > 0){
            const minLen = Math.min(tabs.length, lists.length);
            for(let i = 0; i < minLen; i++){
                const tab = tabs[i];
                const list = lists[i];
                if(!list) continue;
                let name = cleanTabText(tab.textContent) || ('线路'+(i+1));
                name = mapLineName(name, i);
                const eps = extractEpisodesFromContainer(list);
                const finalEps = eps.length > 0 ? eps : [{ text:'播放', url:currentUrl, num:1 }];
                const key = name + '|' + finalEps.length;
                if(!seenKeys.has(key)){
                    seenKeys.add(key);
                    lines.push({name, episodes:finalEps, total:finalEps.length, index:i, isMovie:true});
                }
            }
        }
        if(lines.length === 0 && lists.length > 0){
            lists.forEach((list, idx) => {
                const eps = extractEpisodesFromContainer(list);
                const finalEps = eps.length > 0 ? eps : [{ text:'播放', url:currentUrl, num:1 }];
                let name = mapLineName('线路'+(idx+1), idx);
                const key = name + '|' + finalEps.length;
                if(!seenKeys.has(key)){
                    seenKeys.add(key);
                    lines.push({name, episodes:finalEps, total:finalEps.length, index:idx, isMovie:true});
                }
            });
        }
        if(lines.length === 0 && tabs.length > 0){
            tabs.forEach((tab, idx) => {
                let name = cleanTabText(tab.textContent) || ('线路'+(idx+1));
                name = mapLineName(name, idx);
                const ep = { text:'播放', url:currentUrl, num:1 };
                const key = name + '|1';
                if(!seenKeys.has(key)){
                    seenKeys.add(key);
                    lines.push({name, episodes:[ep], total:1, index:idx, isMovie:true});
                }
            });
        }
        if(lines.length === 0){
            const ep = { text:'播放', url:currentUrl, num:1 };
            lines.push({name: mapLineName('超清2-秒播4K', 0), episodes:[ep], total:1, index:0, isMovie:true});
        }
        return lines;
    }
    if(tabs.length > 0 && lists.length > 0){
        const minLen = Math.min(tabs.length, lists.length);
        for(let i = 0; i < minLen; i++){
            const tab = tabs[i];
            const list = lists[i];
            if(!list) continue;
            let name = (tab.textContent || '').trim().replace(/\s+/g,' ') || ('线路'+(i+1));
            name = mapLineName(name, i);
            const eps = extractEpisodesFromContainer(list);
            if(eps.length > 0){
                const key = name + '|' + eps.length;
                if(!seenKeys.has(key)){
                    seenKeys.add(key);
                    lines.push({name, episodes:eps, total:eps.length, index: i});
                }
            }
        }
    }
    if(lines.length === 0 && lists.length > 0){
        lists.forEach((list, idx) => {
            const eps = extractEpisodesFromContainer(list);
            if(eps.length > 0){
                let name = mapLineName('线路'+(idx+1), idx);
                const key = name + '|' + eps.length;
                if(!seenKeys.has(key)){
                    seenKeys.add(key);
                    lines.push({name, episodes:eps, total:eps.length, index: idx});
                }
            }
        });
    }
    if(lines.length === 0){
        const video = document.querySelector('video');
        if(video){
            let parent = video.parentElement;
            for(let i=0; i<8 && parent; i++){
                const links = parent.querySelectorAll('a[href]');
                const eps = [];
                links.forEach(a => {
                    const text = (a.textContent||'').trim();
                    const num = parseEpisodeNumber(text);
                    const url = a.href;
                    if(num > 0 || /集|ep|EP|play\//i.test(text+url)){
                        eps.push({text:text||url, url:url, num:num||9999});
                    }
                });
                if(eps.length >= 1){
                    const sorted = eps.sort((a,b)=>{
                        if(a.num !== b.num) return a.num - b.num;
                        return a.text.localeCompare(b.text);
                    });
                    const name = mapLineName('默认线路', 0);
                    lines.push({name, episodes:sorted, total:sorted.length, index: 0});
                    break;
                }
                parent = parent.parentElement;
            }
        }
    }
    if(lines.length === 0 || lines.length < 2){
        const allLinks = document.querySelectorAll('a[href]');
        const eps = [];
        const seenUrls = new Set();
        allLinks.forEach(a => {
            const text = (a.textContent||'').trim();
            const url = a.href;
            if(seenUrls.has(url)) return;
            const num = parseEpisodeNumber(text);
            if(num > 0 && num < 5000){
                seenUrls.add(url);
                eps.push({text:text||url, url:url, num:num});
            }else if(/play\/\d+\/\d+/.test(url)){
                const m = url.match(/\/play\/\d+\/(\d+)/);
                if(m){
                    const n = parseInt(m[1]);
                    if(n > 0){
                        seenUrls.add(url);
                        eps.push({text:text||('第'+n+'集'), url:url, num:n});
                    }
                }
            }
        });
        if(eps.length >= 1){
            const sorted = eps.sort((a,b)=>a.num-b.num);
            const groups = {};
            sorted.forEach(ep => {
                const base = ep.url.split('?')[0].split('#')[0]
                    .replace(/\/\d+\/\d+$/, '/X/X')
                    .replace(/\/\d+$/, '/X');
                if(!groups[base]) groups[base] = [];
                groups[base].push(ep);
            });
            const groupEntries = Object.entries(groups);
            if(groupEntries.length === 1 || lines.length === 0){
                groupEntries.forEach(([base, groupEps], idx) => {
                    const gSorted = groupEps.sort((a,b)=>a.num-b.num);
                    if(lines.length === 0){
                        const name = mapLineName('线路'+(idx+1), idx);
                        lines.push({name, episodes:gSorted, total:gSorted.length, index: idx});
                    }
                });
            }
        }
    }
    return lines;
}
function extractEpisodesFromContainer(container){
    const links = container.querySelectorAll('a[href]');
    const eps = [];
    const seenUrls = new Set();
    links.forEach(a => {
        const text = (a.textContent||'').trim().replace(/\s+/g,' ');
        const url = a.href;
        const num = parseEpisodeNumber(text);
        const hasEpFeature = num > 0 ||
            /第.+集|EP\d+|ep\d+|#\d+/i.test(text) ||
            /play\/\d+\/\d+/.test(url) ||
            /集/.test(text);
        if(hasEpFeature && !seenUrls.has(url)){
            seenUrls.add(url);
            eps.push({text: text || url, url: url, num: num || 9999});
        }
    });
    return eps.sort((a,b)=>{
        if(a.num !== b.num) return a.num - b.num;
        return a.text.localeCompare(b.text);
    });
}
// ========== 影片元数据（名称/简介/年份）自动识别 ==========
// 从当前播放页 DOM 中尽可能全面地提取影片标题
function getMovieTitle(){
    const clean = (t)=> (t||'').trim().replace(/\s+/g,' ').replace(/\s*[-–—]\s*第.+集.*$/,'')
                  .replace(/\s*第\s*[\d一二三四五六七八九十]+集.*$/,'')
                  .replace(/\s*[-–—]\s*(电影|电视剧|动漫|综艺|短剧).*$/,'');
    const h1 = document.querySelector('h1');
    if(h1){ const t = clean(h1.textContent); if(t && t.length>=2 && t.length<60) return t; }
    const sel = document.querySelector('.module-info-heading,.detail-title,[itemprop="name"],.video-title,.play-title,.anthology-title');
    if(sel){ const t = clean(sel.textContent); if(t && t.length>=2 && t.length<60) return t; }
    let dt = (document.title||'').trim().replace(/\s*[-|·]\s*(好好看|hhkan\d*)\.?\w*\s*$/i,'')
             .replace(/\s*[-|·]\s*(在线观看|免费观看|高清|完整版).*$/,'')
             .replace(/\s*[-–—]\s*第.+集.*$/,'')
             .replace(/\s*第\s*[\d一二三四五六七八九十]+集.*$/,'')
             .replace(/\s*[-|·]\s*www\.hhkan\d*\.com.*$/i,'')
             .trim();
    return (dt && dt.length>=2 && dt.length<60) ? dt : '';
}
// 从文本中提取 4 位公元年
function parseYearFromText(text){
    if(!text) return '';
    const m = text.match(/(?:^|\D)((19[5-9]\d|20[0-4]\d))(?:\D|$)/);
    return m ? m[1] : '';
}
// 从当前页 DOM 提取年份
function getMovieYear(){
    const meta = document.querySelector('meta[name="description"]');
    if(meta && meta.content){ const y = parseYearFromText(meta.content); if(y) return y; }
    const og = document.querySelector('meta[property="og:title"],meta[property="og:description"]');
    if(og && og.content){ const y = parseYearFromText(og.content); if(y) return y; }
    const info = document.querySelector('.module-info-intro,.detail-info,.video-info,.play-info,.anthology-info');
    if(info){ const y = parseYearFromText(info.textContent); if(y) return y; }
    return parseYearFromText(document.body.innerText.slice(0,800)) || parseYearFromText(document.title);
}
// 从当前页 DOM 同步提取简介
function getMovieIntroSync(){
    const meta = document.querySelector('meta[name="description"]');
    if(meta && meta.content && meta.content.length>8) return meta.content.replace(/^.*?(?=[\u4e00-\u9fa5a-zA-Z])/,'');
    const og = document.querySelector('meta[property="og:description"]');
    if(og && og.content && og.content.length>8) return og.content;
    const intro = document.querySelector('.module-info-intro p,.detail-intro,.video-intro,.play-intro,.anthology-intro,.intro-content,.summary');
    if(intro){ const t=(intro.textContent||'').trim().replace(/\s+/g,' '); if(t.length>8) return t; }
    return '';
}
// 从详情页 HTML 字符串解析标题/简介/年份/海报/类型
function parseDetailFromHtml(html){
    const decode = (s)=> (s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    let title='', intro='', year='', poster='', genre='';
    const mTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]{2,80})"/i)
              || html.match(/<title>([^<]{2,80})<\/title>/i);
    if(mTitle) title = decode(mTitle[1]).trim().replace(/\s+/g,' ');
    const mDesc = html.match(/<meta[^>]+name="description"[^>]+content="([^"]{8,500})"/i)
              || html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]{8,500})"/i);
    if(mDesc) intro = decode(mDesc[1]).trim().replace(/\s+/g,' ');
    if(!intro){
        const mIntro = html.match(/<div[^>]+class="[^"]*intro[^"]*"[^>]*>([\s\S]{20,600}?)<\/div>/i)
                   || html.match(/<p[^>]+class="[^"]*intro[^"]*"[^>]*>([\s\S]{20,600}?)<\/p>/i);
        if(mIntro) intro = decode(mIntro[1].replace(/<[^>]+>/g,'')).trim().replace(/\s+/g,' ');
    }
    // 海报图：og:image 优先，其次详情页海报图标签
    const mOgImg = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if(mOgImg) poster = decode(mOgImg[1]).trim();
    if(!poster){
        const mPoster = html.match(/<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)"/i)
                    || html.match(/<div[^>]+class="[^"]*poster[^"]*"[^>]*>[\s\S]{0,200}?<img[^>]+src="([^"]+)"/i);
        if(mPoster) poster = decode(mPoster[1]).trim();
    }
    // 类型/分类：从详情信息区提取"类型：xx"或分类链接文本
    const mGenre = html.match(/类型[：:]\s*([\u4e00-\u9fa5]{1,8}(?:[\/、][\u4e00-\u9fa5]{1,8}){0,3})/)
                || html.match(/<a[^>]+href="[^"]*genre[^"]*"[^>]*>([\u4e00-\u9fa5]{2,6})<\/a>/i)
                || html.match(/<a[^>]+href="[^"]*category[^"]*"[^>]*>([\u4e00-\u9fa5]{2,6})<\/a>/i);
    if(mGenre) genre = decode(mGenre[1]).trim().replace(/[\/、]/g,', ');
    year = parseYearFromText(intro) || parseYearFromText(title);
    return { title:title||'', intro:intro||'', year:year||'', poster:poster||'', genre:genre||'' };
}

// ==================== ★ 从 hhkan0.com 对应影片详情页提取海报 ★ ====================
// 优先用当前 URL 中的影片 id 拼接 https://www.hhkan0.com/movie/{id}.html 抓取，
// 通过 parseDetailFromHtml 解析 og:image / poster 图，并写入 poster_cache(键=影片标题)。
// 返回解析到的海报绝对 URL；失败返回 ''。
function fetchHhkanPoster(title, id){
    return new Promise(function(resolve){
        if(!id){ resolve(''); return; }
        var url = 'https://www.hhkan0.com/movie/' + encodeURIComponent(id) + '.html';
        try{
            var xhr = new XMLHttpRequest();
            xhr.timeout = 8000;
            xhr.open('GET', url, true);
            xhr.onload = function(){
                if(xhr.status !== 200){ resolve(''); return; }
                var d = parseDetailFromHtml(xhr.responseText);
                var poster = d.poster || '';
                if(poster && !/^https?:/i.test(poster)){
                    // 相对路径补成 hhkan0.com 绝对地址
                    poster = 'https://www.hhkan0.com' + (poster.charAt(0)==='/' ? '' : '/') + poster;
                }
                if(poster && title){ setPosterCache(title, poster); }
                resolve(poster);
            };
            xhr.onerror = function(){ resolve(''); };
            xhr.ontimeout = function(){ resolve(''); };
            xhr.send();
        }catch(e){ resolve(''); }
    });
}

// 从当前页 DOM 同步提取海报图 URL
function getMoviePosterSync(){
    // 优先：从海报缓存按当前影片标题取（由 fetchHhkanPoster / startFetchPosterQueue 写入，值为 hhkan0.com 海报 URL）
    var curTitle = (getMovieTitle() || '').trim();
    if(curTitle){
        var cache = getPosterCache();
        var cached = cache[curTitle];
        if(cached && /^https?:/i.test(cached)) return cached;
    }
    // 回退：当前页 DOM 探测 og:image / 各类 poster 图
    var og = document.querySelector('meta[property="og:image"],meta[property="og:image:url"]');
    if(og && og.content) return og.content;
    var posterImg = document.querySelector('.module-info-poster img,.detail-poster img,.video-poster img,.play-poster img,.anthology-poster img,.poster img,.module-item-pic img');
    if(posterImg && posterImg.src) return posterImg.src;
    var firstImg = document.querySelector('.module-info img,.detail-info img');
    if(firstImg && firstImg.src && !firstImg.src.includes('avatar') && !firstImg.src.includes('icon')) return firstImg.src;
    return '';
}
// 从当前页 DOM 同步提取类型/分类
function getMovieGenreSync(){
    const info = document.querySelector('.module-info-intro,.detail-info,.video-info,.play-info,.anthology-info');
    if(info){
        const m = (info.textContent||'').match(/类型[：:]\s*([\u4e00-\u9fa5]{1,8}(?:[\/、][\u4e00-\u9fa5]{1,8}){0,3})/);
        if(m) return m[1].trim().replace(/[\/、]/g,', ');
    }
    const catLink = document.querySelector('a[href*="genre"],a[href*="category"],a[href*="type"]');
    if(catLink && catLink.textContent && catLink.textContent.trim().length<=8) return catLink.textContent.trim();
    return '';
}
// 从当前 URL 解析影片 id
function getCurrentMovieId(){
    const m = location.href.match(/\/movie\/(\d+)\.html/)
           || location.href.match(/\/play\/(\d+)(?:\/|$)/)
           || location.href.match(/\/(?:detail|tv|anime|variety|short)\/(\d+)/);
    return m ? m[1] : '';
}
// 异步抓取详情页补全简介/年份/标题
function fetchMovieDetail(){
    return new Promise((resolve)=>{
        const id = getCurrentMovieId();
        const url = id ? `https://www.hhkan0.com/movie/${id}.html` : '';
        const fallback = ()=> resolve({ intro:getMovieIntroSync(), year:getMovieYear(), title:getMovieTitle(), poster:getMoviePosterSync(), genre:getMovieGenreSync() });
        if(!url){ fallback(); return; }
        try{
            const xhr = new XMLHttpRequest();
            xhr.timeout = 7000;
            xhr.open('GET', url, true);
            xhr.onload = function(){
                if(xhr.status === 200){
                    const d = parseDetailFromHtml(xhr.responseText);
                    resolve({ intro:d.intro||getMovieIntroSync(), year:d.year||getMovieYear(), title:d.title||getMovieTitle(), poster:d.poster||getMoviePosterSync(), genre:d.genre||getMovieGenreSync() });
                }else{ fallback(); }
            };
            xhr.onerror = ()=> fallback();
            xhr.ontimeout = ()=> fallback();
            xhr.send();
        }catch(e){ fallback(); }
    });
}
function parseEpisodeNumber(text){
    if(!text) return 0;
    const cnMap = {
        '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
        '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,
        '二十':20,'廿':20,'三十':30,'四十':40,'五十':50,
    };
    let m = text.match(/第\s*([\d一二三四五六七八九十廿卅]+)\s*(?![\-\～~])\s*集/);
    if(m){
        const v = m[1];
        if(/^\d+$/.test(v)) return parseInt(v);
        if(cnMap[v]) return cnMap[v];
        let sum = 0;
        let i = 0;
        while(i < v.length){
            if(i+1 < v.length){
                const two = v.substr(i,2);
                if(cnMap[two] !== undefined){
                    sum += cnMap[two];
                    i += 2;
                    continue;
                }
            }
            const one = v[i];
            if(cnMap[one] !== undefined) sum += cnMap[one];
            i++;
        }
        return sum > 0 ? sum : 1;
    }
    m = text.match(/[Ee][Pp]?\s*(\d+)/);
    if(m) return parseInt(m[1]);
    m = text.match(/S\d+E(\d+)/i);
    if(m) return parseInt(m[1]);
    m = text.match(/(?:^|第|\s)(\d+)\s*集/);
    if(m) return parseInt(m[1]);
    m = text.match(/集\s*(\d+)/);
    if(m) return parseInt(m[1]);
    m = text.match(/\/play\/\d+\/(\d+)/);
    if(m) return parseInt(m[1]);
    if(/集|ep|EP|play\//i.test(text)){
        m = text.match(/(\d{1,4})/);
        if(m){
            const n = parseInt(m[1]);
            if(n > 0 && n < 5000) return n;
        }
    }
    return 0;
}
function getActiveLineIndex(){
    const activeSelectors = ['.module-tab-item.active', '.tab-item.active', '.play-source.active',
                              '.source-tab.active', '.line-tab.active', '.num-tab.active',
                              '.play-tab.active', '.server-tab.active'];
    for(const sel of activeSelectors){
        const el = document.querySelector(sel);
        if(el){
            const all = document.querySelectorAll(sel.replace('.active',''));
            return Array.from(all).indexOf(el);
        }
    }
    const record = getSelectRecord();
    return record.lineIndex || 0;
}
// ========== 自动检测当前播放的线路 + 集数 ==========
// 仅在进入播放页（出现 video 元素）后调用，避免无谓检测。
// 返回值：{ found, lineIndex, lineName, episodeNum, episodeText } 或 null（提取失败）
function detectCurrentPlay(){
    try{
        const lines = extractAllLines();
        if(!lines || lines.length === 0) return null;
        const curUrl = location.href.split('?')[0].split('#')[0];
        // 1) 用当前 URL 精确匹配各线路的每一集
        for(let li = 0; li < lines.length; li++){
            const line = lines[li];
            for(const ep of (line.episodes || [])){
                const epUrl = (ep.url || '').split('?')[0].split('#')[0];
                if(epUrl && epUrl === curUrl){
                    return {
                        found: true,
                        lineIndex: li,
                        lineName: line.name || ('线路'+(li+1)),
                        episodeNum: ep.num || 0,
                        episodeText: ep.text || ''
                    };
                }
            }
        }
        // 2) URL 未精确命中：回退到当前激活的线路 tab + 页面标题/URL 推断集数
        const activeIdx = getActiveLineIndex();
        const line = lines[activeIdx] || lines[0];
        const li = lines.indexOf(line);
        // 从 document.title / h1 推断当前集数
        const titleText = (document.title || '') + ' ' + ((document.querySelector('h1')||{}).textContent||'');
        const inferredNum = parseEpisodeNumber(titleText) || parseEpisodeNumber(location.href);
        // 在线路集中找 num 匹配的那一集
        let matchedEp = null;
        if(inferredNum > 0){
            matchedEp = (line.episodes || []).find(e => e.num === inferredNum) || null;
        }
        return {
            found: !!matchedEp,
            lineIndex: li,
            lineName: line.name || ('线路'+(li+1)),
            episodeNum: matchedEp ? matchedEp.num : inferredNum,
            episodeText: matchedEp ? matchedEp.text : ''
        };
    }catch(e){
        console.warn('[自动检测] detectCurrentPlay 异常：', e);
        return null;
    }
}
// 将检测结果写入选择记录 + 弹出提示条
function autoDetectAndNotify(){
    // 仅在存在视频元素（即已进入播放页）时才检测
    if(!hasVideoElement()) return;
    const result = detectCurrentPlay();
    if(!result) return;
    // 写入选择记录（补全线路信息）
    const recUpdate = { lineIndex: result.lineIndex, lineName: result.lineName };
    if(result.episodeNum > 0){
        recUpdate.episodeNum = result.episodeNum;
        recUpdate.episodeText = result.episodeText || ('第'+result.episodeNum+'集');
    }
    saveSelectRecord(recUpdate);
    // 弹出顶部检测提示条
    showDetectBar(result);
    // Toast 提示
    if(typeof showFloatTip === 'function'){
        const epPart = result.episodeNum > 0 ? (' · 第'+result.episodeNum+'集') : '';
        showFloatTip('自动检测：'+result.lineName+epPart);
    }
    console.log('[自动检测] 线路='+result.lineName+' 集数='+(result.episodeNum||'-'));
}
// 顶部淡蓝检测提示条（自动 6 秒后消失，可手动关闭）
function showDetectBar(result){
    let bar = document.querySelector('#hhkan-detect-bar');
    if(!bar){
        bar = document.createElement('div');
        bar.id = 'hhkan-detect-bar';
        const fsEl = getFullscreenElement();
        if(fsEl) fsEl.appendChild(bar);
        else document.body.appendChild(bar);
    }
    const epPart = result.episodeNum > 0 ? (' · 第 <b>'+result.episodeNum+'</b> 集') : '';
    bar.innerHTML = '🔍 自动检测：'+result.lineName+epPart+
        ' <span class="hd-close" id="hd-close-btn">✕</span>';
    // 触发重排以重新开始动画
    bar.classList.remove('hd-show');
    void bar.offsetWidth;
    bar.classList.add('hd-show');
    const closeBtn = bar.querySelector('#hd-close-btn');
    if(closeBtn){
        closeBtn.onclick = (e)=>{ e.stopPropagation(); bar.classList.remove('hd-show'); };
    }
    // 6 秒后自动隐藏
    clearTimeout(bar._hideTimer);
    bar._hideTimer = setTimeout(()=>{ bar.classList.remove('hd-show'); }, 6000);
}
function switchLineTab(index){
    const tabSelectors = ['.module-tab-item', '.tab-item', '.play-source', '.source-tab',
                          '.line-tab', '.num-tab', '.anthology-tab a',
                          '.play-tab', '.server-tab', '.source-item'];
    for(const sel of tabSelectors){
        const tabs = document.querySelectorAll(sel);
        if(tabs.length > index){
            const tab = tabs[index];
            try{
                tab.scrollIntoView({behavior:'instant', block:'nearest', inline:'nearest'});
            }catch(e){}
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            tab.dispatchEvent(clickEvent);
            if(typeof tab.click === 'function'){
                tab.click();
            }
            return true;
        }
    }
    return false;
}
// ========== 选集弹窗 ==========
function buildEpisodeModal(lines){
    const old = document.querySelector('#episode-modal-mask');
    if(old) old.remove();
    if(typeof requestOpenModal==='function' && !requestOpenModal('episode-modal-mask')) return;
    const mask = document.createElement('div');
    mask.id = 'episode-modal-mask';
    const record = getSelectRecord();
    let activeIdx = record.lineIndex || getActiveLineIndex();
    if(activeIdx >= lines.length) activeIdx = 0;
    const totalEps = lines.reduce((sum,l) => sum + l.total, 0);
    const currentUrl = location.href;
    const currentDomain = location.hostname;
    const isMovie = lines.length > 0 && lines[0].isMovie;
    // 影片元数据（同步先取，异步补全）
    const _syncTitle = getMovieTitle();
    const _syncYear  = getMovieYear();
    const _syncIntro = getMovieIntroSync();
    const _syncPoster = getMoviePosterSync();
    const _syncGenre  = getMovieGenreSync();
    const _dispTitle = _syncTitle || (isMovie ? '影片详情' : '选集详情');
    const _dispYear  = _syncYear ? `（${_syncYear}）` : '';
    const _dispIntro = _syncIntro ? _syncIntro : '简介加载中…';
    const _posterHtml = _syncPoster
        ? `<img class="ep-movie-poster-img" id="ep-movie-poster-img" src="${_syncPoster.replace(/"/g,'&quot;')}" alt="海报">`
        : `<div class="ep-movie-poster-placeholder" id="ep-movie-poster-ph">🎬</div>`;
    const _genreHtml = _syncGenre ? `<span class="ep-movie-genre" id="ep-movie-genre">${_syncGenre}</span>` : '';
    // 【修复】默认 3 行省略；是否加 ep-intro-long 仅用于标记"内容较长"，不影响样式（样式由 CSS 控制）
    const _introLong = (_syncIntro.length > 60) ? ' ep-intro-long' : '';
    // 读取/初始化选集排序偏好（'asc'=正序 'desc'=倒序），持久化到 localStorage
    const EP_ORDER_KEY = 'episode_order';
    let _epOrder = 'asc';
    try{ _epOrder = localStorage.getItem(EP_ORDER_KEY) || 'asc'; }catch(e){}
    if(_epOrder !== 'asc' && _epOrder !== 'desc') _epOrder = 'asc';
    const _orderLabel = _epOrder === 'desc' ? '倒序 ↑' : '正序 ↓';
    let html = `<div id="episode-modal-box">
        <div class="ep-header">
            <span class="ep-title">📋 ${isMovie ? '播放线路' : '选集列表'}</span>
            <span class="ep-count">共 <b>${totalEps}</b> 集 / ${lines.length} 条线路</span>
            <button class="ep-order-btn" id="ep-order-btn" type="button" title="点击切换正序/倒序排列">${_orderLabel}</button>
            <button class="ep-close" id="ep-close-btn">✕</button>
        </div>
        <div class="ep-movie-card" id="ep-movie-card">
            <div class="ep-movie-poster" id="ep-movie-poster">${_posterHtml}</div>
            <div class="ep-movie-meta">
                <div class="ep-movie-title" id="ep-movie-title" title="${_dispTitle.replace(/"/g,'&quot;')}">${_dispTitle} <span class="ep-movie-year" id="ep-movie-year">${_dispYear}</span> ${_genreHtml}</div>
                <div class="ep-movie-intro${_introLong}" id="ep-movie-intro">${_dispIntro}</div>
                <button class="ep-intro-toggle" id="ep-intro-toggle" type="button">展开 ▾</button>
            </div>
        </div>
        <div class="ep-current-info">🌐 ${currentDomain} | 当前路径：${currentUrl.replace(location.origin,'')}</div>
        <div class="ep-record-info" id="ep-record-bar">📌 上次选择：<span id="ep-record-text">${record.lineName||'未选择'} | 第${record.episodeNum||'-'}集</span></div>`;
    if(lines.length > 1){
        html += `<div class="ep-line-tabs">`;
        lines.forEach((line, idx) => {
            const active = idx === activeIdx ? 'ep-line-active' : '';
            html += `<div class="ep-line-tab ${active}" data-idx="${idx}" title="${line.name} - 点击切换">${line.name} <small>(${line.total}集)</small></div>`;
        });
        html += `</div>`;
    }
    lines.forEach((line, idx) => {
        const hidden = idx !== activeIdx && lines.length > 1 ? 'style="display:none"' : '';
        html += `<div class="ep-line-panel" data-idx="${idx}" ${hidden}>
            <div class="ep-line-info">▎${line.name}（${line.total} 集）</div>
            <div class="ep-grid">`;
        line.episodes.forEach((ep, epIdx) => {
            const isLastSelected = (idx === record.lineIndex && ep.num === record.episodeNum) ? 'ep-selected' : '';
            const urlPath = ep.url.replace(location.origin, '').split('?')[0];
            let btnText;
            if(isMovie){
                btnText = (line.total > 1) ? (ep.text || ('第'+(epIdx+1)+'集')) : '▶ 播放';
            }else{
                btnText = ep.text || ('第'+(epIdx+1)+'集');
            }
            html += `<a class="ep-item ${isLastSelected}" href="${ep.url}" title="点击跳转：${urlPath}" data-num="${ep.num}" data-line="${idx}">${btnText}</a>`;
        });
        html += `</div></div>`;
    });
    html += `<div class="ep-footer">💡 ${isMovie ? '电影模式：每条线路1集，点击切换播放源' : '点击线路标签切换线路 | 点击选集跳转 | 悬浮球可拖动'}</div></div>`;
    mask.innerHTML = html;

    /* ========== 【修复核心】按渲染后实际高度判定是否需要展开按钮 ========== */
    const introEl = mask.querySelector('#ep-movie-intro');
    const toggleBtn = mask.querySelector('#ep-intro-toggle');

    // 通过比较 scrollHeight(内容真实高度) 与 clientHeight(可视高度) 判断是否被省略
    const updateToggleState = () => {
        if(!introEl || !toggleBtn) return;
        // 临时放开限制测量真实内容高度
        const origClamp = introEl.style.webkitLineClamp;
        introEl.style.webkitLineClamp = 'unset';
        const fullH = introEl.scrollHeight;
        introEl.style.webkitLineClamp = origClamp; // 恢复（CSS 默认 3 行）
        const needsToggle = fullH > introEl.clientHeight + 2; // +2 容差
        toggleBtn.hidden = !needsToggle;
        if(!needsToggle){
            introEl.classList.remove('ep-intro-expanded');
            toggleBtn.textContent = '展开 ▾';
        }
    };

    // 初始渲染后判定一次（简介为"加载中"时通常无需展开）
    if(introEl && toggleBtn){
        setTimeout(updateToggleState, 0);
    }

    // 异步补全影片详情（简介/年份/标题/海报/类型），优先从详情页抓取
    fetchMovieDetail().then(md => {
        const tEl = mask.querySelector('#ep-movie-title');
        const yEl = mask.querySelector('#ep-movie-year');
        const iEl = mask.querySelector('#ep-movie-intro');
        const gEl = mask.querySelector('#ep-movie-genre');
        const pEl = mask.querySelector('#ep-movie-poster');
        if(md.title && tEl){
            const cur = (tEl.childNodes[0] && tEl.childNodes[0].nodeValue) || tEl.textContent || '';
            if(!cur.trim() || cur.trim()==='影片详情' || cur.trim()==='选集详情'){
                tEl.childNodes[0] ? (tEl.childNodes[0].nodeValue = md.title) : (tEl.textContent = md.title);
            }
        }
        if(md.year && yEl && !yEl.textContent){ yEl.textContent = '（'+md.year+'）'; }
        if(md.intro && iEl){
            const cur = (iEl.textContent||'').trim();
            if(cur==='简介加载中…' || cur==='' || cur.length<md.intro.length){
                iEl.textContent = md.intro;
                // 【修复】不再加无效的 ep-intro-long 类，改为触发按高度重判
                // 简介内容变化后重新判定按钮显隐
                setTimeout(updateToggleState, 0);
            }
        }
        if(md.genre && gEl && !gEl.textContent){ gEl.textContent = md.genre; }
        else if(md.genre && !gEl){
            const titleEl = mask.querySelector('#ep-movie-title');
            if(titleEl && !titleEl.querySelector('.ep-movie-genre')){
                const sp = document.createElement('span');
                sp.className = 'ep-movie-genre';
                sp.id = 'ep-movie-genre';
                sp.textContent = md.genre;
                titleEl.appendChild(sp);
            }
        }
        // 【修复】海报：优先用 hhkan0.com 对应影片详情页抓取的海报（fetchHhkanPoster 写入 poster_cache），
        // 拿到后无条件更新 #ep-movie-poster，确保选集弹窗图片来自 hhkan0.com 该影片。
        var posterFromHhkan = '';
        try{ posterFromHhkan = (getPosterCache() || {})[(getMovieTitle()||'').trim()] || ''; }catch(e){}
        var posterToUse = posterFromHhkan || md.poster || '';
        if(posterToUse && pEl){
            var imgTag = '<img class="ep-movie-poster-img" src="' + posterToUse.replace(/"/g,'&quot;') + '" alt="海报">';
            // 若缓存未命中，则现场抓取 hhkan0 详情页补充
            if(!posterFromHhkan){
                fetchHhkanPoster((getMovieTitle()||'').trim(), getCurrentMovieId()).then(function(u){
                    if(u){ pEl.innerHTML = '<img class="ep-movie-poster-img" src="' + u.replace(/"/g,'&quot;') + '" alt="海报">'; }
                }).catch(function(){});
            }
            pEl.innerHTML = imgTag;
        }
    }).catch(()=>{});

    // 简介展开/收起（点击切换 ep-intro-expanded）
    if(toggleBtn && introEl){
        toggleBtn.addEventListener('click', (e)=>{
            e.preventDefault();
            e.stopPropagation();
            const expanded = introEl.classList.toggle('ep-intro-expanded');
            toggleBtn.textContent = expanded ? '收起 ▴' : '展开 ▾';
        });
    }

    const fsEl = typeof getFullscreenElement==='function' ? getFullscreenElement() : null;
    if(fsEl){
        fsEl.appendChild(mask);
        fsEl.style.overflow = 'visible';
    }else{
        document.body.appendChild(mask);
    }
    mask.querySelector('#ep-close-btn').onclick = (e)=>{ e.stopPropagation(); mask.remove(); };
    mask.onclick = (e)=>{ if(e.target===mask) mask.remove(); };
    mask.querySelector('#episode-modal-box').addEventListener('click',e=>e.stopPropagation());

    /* ========== 选集正序/倒序切换 + 自动滚动到当前集 ========== */
    const orderBtn = mask.querySelector('#ep-order-btn');
    // 对指定线路的面板按当前排序状态排列其中的 .ep-item（暴露到 window 供面板重建后调用）
    const applyOrderToPanel = window.__hhkanApplyEpOrder = (panel, order) => {
        if(!panel) return;
        const grid = panel.querySelector('.ep-grid');
        if(!grid) return;
        const items = Array.from(grid.querySelectorAll('.ep-item'));
        if(items.length === 0) return;
        // 依据 data-num 排序：正序升序，倒序降序
        items.sort((a,b)=>{
            const an = parseInt(a.dataset.num)||0, bn = parseInt(b.dataset.num)||0;
            return order === 'desc' ? (bn - an) : (an - bn);
        });
        items.forEach(it => grid.appendChild(it)); // 追加即重排
        // 重建后重新绑定集数按钮的点击事件（沿用已有的 onEpItemClick）
        panel.querySelectorAll('.ep-item').forEach(item => {
            item.addEventListener('click', (typeof onEpItemClick !== 'undefined' ? onEpItemClick : ()=>{}));
        });
        // 重新标记"上次选择"的集数为选中态
        try{
            const rec = (typeof getSelectRecord==='function') ? getSelectRecord() : {};
            if(rec.episodeNum > 0){
                panel.querySelectorAll('.ep-item').forEach(i=>i.classList.remove('ep-selected'));
                const sel = panel.querySelector(`.ep-item[data-num="${rec.episodeNum}"]`);
                if(sel) sel.classList.add('ep-selected');
            }
        }catch(e){}
    };
    // 读取当前排序状态的辅助（供外部调用）
    window.__hhkanGetEpOrder = () => _epOrder;
    // 初始化：对当前激活面板应用已保存的排序
    const curPanel = mask.querySelector(`.ep-line-panel[data-idx="${activeIdx}"]`);
    applyOrderToPanel(curPanel, _epOrder);
    // 排序按钮点击：切换排序并持久化，对当前可见面板重排，并自动滚动到当前播放集
    if(orderBtn){
        orderBtn.addEventListener('click', (e)=>{
            e.preventDefault(); e.stopPropagation();
            _epOrder = (_epOrder === 'asc') ? 'desc' : 'asc';
            try{ localStorage.setItem(EP_ORDER_KEY, _epOrder); }catch(e){}
            orderBtn.textContent = _epOrder === 'desc' ? '倒序 ↑' : '正序 ↓';
            const visPanel = Array.from(mask.querySelectorAll('.ep-line-panel')).find(p => p.style.display !== 'none') || curPanel;
            applyOrderToPanel(visPanel, _epOrder);
            // 排序切换后，等待 DOM 重排完成再滚动到当前集
            setTimeout(scrollToCurrentEp, 50);
            if(typeof showFloatTip==='function') showFloatTip('已切换为：' + (_epOrder==='desc'?'倒序排列':'正序排列'));
        });
    }

    // 自动滚动到当前正在播放的集数（基于选择记录 episodeNum）
    const scrollToCurrentEp = () => {
        const rec = (typeof getSelectRecord==='function') ? getSelectRecord() : {};
        const targetNum = rec.episodeNum;
        if(!targetNum || targetNum <= 0) return;
        const visPanel = Array.from(mask.querySelectorAll('.ep-line-panel')).find(p => p.style.display !== 'none') || curPanel;
        if(!visPanel) return;
        const target = visPanel.querySelector(`.ep-item[data-num="${targetNum}"]`);
        if(target){
            target.scrollIntoView({behavior:'smooth', block:'center'});
            // 高亮提示当前集（短暂加 ep-scroll-hint 类）
            target.classList.add('ep-scroll-hint');
            setTimeout(()=>target.classList.remove('ep-scroll-hint'), 1800);
        }
    };
    // 弹窗渲染完成后执行滚动（等待面板/集数按钮就绪）
    setTimeout(scrollToCurrentEp, 120);
    mask.querySelectorAll('.ep-line-tab').forEach(tab => {
        tab.onclick = (e)=>{
            e.preventDefault();
            e.stopPropagation();
            const idx = parseInt(tab.dataset.idx);
            const lineName = lines[idx] ? lines[idx].name : '线路'+(idx+1);
            saveSelectRecord({ lineIndex: idx, lineName: lineName });
            if(typeof showFloatTip==='function') showFloatTip(`正在切换到：${lineName}...`);
            if(typeof switchLineTab==='function') switchLineTab(idx);
            mask.querySelectorAll('.ep-line-tab').forEach(t=>t.classList.remove('ep-line-active'));
            tab.classList.add('ep-line-active');
            mask.querySelectorAll('.ep-line-panel').forEach(p=>p.style.display='none');
            const panel = mask.querySelector(`.ep-line-panel[data-idx="${idx}"]`);
            if(panel) panel.style.display = '';
            const recordText = mask.querySelector('#ep-record-text');
            if(recordText) recordText.textContent = `${lineName} | 未选择集数`;
            try{ sessionStorage.setItem('hhkan_auto_fullscreen','1'); }catch(e){}
            setTimeout(()=>{
                const newLines = typeof extractAllLines==='function' ? extractAllLines() : lines;
                if(newLines.length > 0 && newLines[idx]){
                    const newPanel = mask.querySelector(`.ep-line-panel[data-idx="${idx}"]`);
                    if(newPanel){
                        const line = newLines[idx];
                        let panelHtml = `<div class="ep-line-info">▎${line.name}（${line.total} 集）</div><div class="ep-grid">`;
                        line.episodes.forEach((ep, epIdx) => {
                            const urlPath = ep.url.replace(location.origin, '').split('?')[0];
                            let btnText;
                            if(line.isMovie){
                                btnText = (line.total > 1) ? (ep.text || ('第'+(epIdx+1)+'集')) : '▶ 播放';
                            }else{
                                btnText = ep.text || ('第'+(epIdx+1)+'集');
                            }
                            panelHtml += `<a class="ep-item" href="${ep.url}" title="点击跳转：${urlPath}" data-num="${ep.num}" data-line="${idx}">${btnText}</a>`;
                        });
                        panelHtml += `</div>`;
                        newPanel.innerHTML = panelHtml;
                        // 面板重建后按当前保存的排序状态重排集数
                        if(typeof applyOrderToPanel === 'function') applyOrderToPanel(newPanel, _epOrder);
                        newPanel.querySelectorAll('.ep-item').forEach(item => {
                            item.addEventListener('click', onEpItemClick);
                        });
                        // 线路切换 + 排序重排后，自动滚动到当前播放集
                        setTimeout(scrollToCurrentEp, 50);
                        if(typeof showFloatTip==='function') showFloatTip(`已切换至${line.name}，共${line.total}集`);
                    }
                }
                if(typeof tryAutoFullscreen==='function') tryAutoFullscreen();
            }, 1000);
        };
    });
    mask.querySelectorAll('.ep-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const num = parseInt(item.dataset.num) || 0;
            const lineIdx = parseInt(item.dataset.line) || 0;
            const lineName = lines[lineIdx] ? lines[lineIdx].name : '';
            const epText = item.textContent || '';
            saveSelectRecord({
                lineIndex: lineIdx,
                episodeNum: num,
                lineName: lineName,
                episodeText: epText,
                url: item.href
            });
            const recordText = mask.querySelector('#ep-record-text');
            if(recordText) recordText.textContent = `${lineName} | 第${num}集`;
            mask.querySelectorAll('.ep-item').forEach(i => i.classList.remove('ep-selected'));
            item.classList.add('ep-selected');
            if(typeof showFloatTip==='function') showFloatTip(`正在跳转并全屏播放：${lineName} - 第${num}集`);
            try{ sessionStorage.setItem('hhkan_auto_fullscreen','1'); }catch(e){}
            setTimeout(()=>{ location.href = item.href; }, 300);
            e.preventDefault();
        });
    });
}
function onEpItemClick(e){
    showFloatTip('正在跳转...');
}
// ========== 上一集 / 下一集 导航 ==========
// direction: -1 = 上一集, 1 = 下一集
// 适配 hhkan0.com：通过 extractAllLines 拿到全部线路/集数，
// 结合当前 URL 与选集记录定位"当前集"，再按方向跳转到相邻一集。
function navigateEpisode(direction){
    const lines = extractAllLines();
    if(!lines || lines.length === 0){
        showFloatTip('未检测到选集列表');
        return;
    }
    const record = getSelectRecord();
    const currentUrl = location.href;
    const currentUrlBase = currentUrl.split('?')[0].split('#')[0];
    // 收集所有线路的所有集，并标注全局序号，便于跨线路连续上下集
    const allEps = []; // {lineIdx, ep, globalIdx}
    lines.forEach((line, lineIdx) => {
        (line.episodes || []).forEach((ep) => {
            allEps.push({ lineIdx, ep, line });
        });
    });
    if(allEps.length === 0){
        showFloatTip('未检测到可选集数');
        return;
    }
    // 定位"当前集"：优先 URL 精确匹配，其次用记录中的 episodeNum 匹配
    let curIdx = -1;
    for(let i = 0; i < allEps.length; i++){
        const epUrl = (allEps[i].ep.url || '').split('?')[0].split('#')[0];
        if(epUrl && epUrl === currentUrlBase){
            curIdx = i;
            break;
        }
    }
    if(curIdx === -1 && record.episodeNum){
        for(let i = 0; i < allEps.length; i++){
            if(allEps[i].ep.num === record.episodeNum){
                curIdx = i;
                break;
            }
        }
    }
    // 单线路单集（电影/单集播放源）：无法通过集数导航
    if(allEps.length === 1){
        showFloatTip(direction > 0 ? '已是最后一集' : '已是第一集');
        return;
    }
    if(curIdx === -1){
        // 当前集无法确定：下一集→跳第一集；上一集→跳最后一集
        curIdx = direction > 0 ? -1 : allEps.length;
    }
    const targetIdx = curIdx + direction;
    if(targetIdx < 0){
        showFloatTip('已经是第一集了');
        return;
    }
    if(targetIdx >= allEps.length){
        showFloatTip('已经是最后一集了');
        return;
    }
    const target = allEps[targetIdx];
    const ep = target.ep;
    const lineIdx = target.lineIdx;
    const line = target.line;
    const lineName = line.name || ('线路'+(lineIdx+1));
    // 若目标集所在线路与当前激活线路不同，先切换线路 tab
    const activeLine = getActiveLineIndex();
    const switchLine = (lineIdx !== activeLine);
    // 保存选集记录
    saveSelectRecord({
        lineIndex: lineIdx,
        episodeNum: ep.num,
        lineName: lineName,
        episodeText: ep.text || ('第'+ep.num+'集'),
        url: ep.url
    });
    // 设置自动全屏标志，跳转后自动进入全屏
    sessionStorage.setItem(AUTO_FS_KEY, "1");
    const doJump = () => {
        if(switchLine){
            const switched = switchLineTab(lineIdx);
            if(switched){
                // 线路切换后 URL 可能已变，延迟再跳具体集
                setTimeout(() => { location.href = ep.url; }, 400);
                return;
            }
        }
        location.href = ep.url;
    };
    setTimeout(doJump, 300);
}
// ========== 悬浮球（选集 + 设置 两个按钮）==========
function createFloatBall(){
    const existing = document.querySelector('#hhkan-float-ball');
    if(existing){
        existing.remove();
    }
    const ball = document.createElement('div');
    ball.id = 'hhkan-float-ball';
    // 定位到视频框（播放器容器）内部左上角；无视频时回退到视口左上角（任务栏下方）
    const vRect = getVideoBounds();
    let ballLeft, ballTop;
    if(vRect && vRect.width > 0 && vRect.height > 0){
        // 先用一个临时球坐标占位，公共对齐函数会计算最终位置
        ballLeft = vRect.left + 12;
        ballTop  = vRect.top + 12;
        _lastVideoRectKey = `${Math.round(vRect.left)},${Math.round(vRect.top)},${Math.round(vRect.width)},${Math.round(vRect.height)}`;
    }else{
        const savedPos = getFloatBallPos();
        ballLeft = savedPos.left || 16;
        ballTop  = savedPos.top  || (BAR_HEIGHT + 10);
        _lastVideoRectKey = '';
    }
    // 四个按钮：上一集 / 下一集（纯文字无图标）/ 选集 / 设置
    ball.innerHTML = `
        <div class="fb-container">
            <div class="fb-main-btn" title="点击展开/收起菜单">
                <span class="fb-icon">⚙</span>
            </div>
            <div class="fb-btn-group" style="display:none;">
                <div class="fb-action-btn fb-btn-prev" data-action="prev" title="上一集">
                    <span class="fb-btn-label">上一集</span>
                </div>
                <div class="fb-action-btn fb-btn-next" data-action="next" title="下一集">
                    <span class="fb-btn-label">下一集</span>
                </div>
                <div class="fb-action-btn fb-btn-episodes" data-action="episodes" title="选集列表">
                    <span class="fb-btn-icon">📋</span>
                    <span class="fb-btn-label">选集</span>
                </div>
                <div class="fb-action-btn fb-btn-settings" data-action="settings" title="播放设置">
                    <span class="fb-btn-icon">⚙</span>
                    <span class="fb-btn-label">设置</span>
                </div>
            </div>
        </div>
    `;
    ball.style.left = ballLeft + 'px';
    ball.style.top = ballTop + 'px';
    ball.style.right = 'auto';
    ball.style.bottom = 'auto';
    // 确保在视频框之上显示
    ball.style.zIndex = '2147483640';
    ball.style.display = hasVideoElement() ? 'flex' : 'none';
    ball.classList.add('fb-visible');
    const fsEl = getFullscreenElement();
    if(fsEl){
        fsEl.appendChild(ball);
        fsEl.style.overflow = 'visible';
    }else{
        if(document.body){
            document.body.appendChild(ball);
        }else{
            document.documentElement.appendChild(ball);
        }
    }
    initFloatBallEvents(ball);
    // 创建后立即按当前视频框对齐到左上角（统一走公共对齐函数）
    const _vRect = getVideoBounds();
    if(_vRect && _vRect.width > 0 && _vRect.height > 0){
        _alignFloatBallToVideoTopRight(ball, _vRect);
    }
    // 球刚出现时若鼠标未触碰，2.5 秒后自动降级透明度（opacity→0.3）
    isHovering = false;
    startFadeTimer(ball);
}
// 记录上次对齐时的视频框 rect，用于检测尺寸/位置是否变化
let _lastVideoRectKey = '';
function _alignFloatBallToVideoTopRight(ball, vRect){
    if(!ball || !vRect) return;
    const MARGIN = 12;
    const BTN = 64;
    const MENU_H = 200; // 竖排四按钮高度（按钮40*4 + gap6*3 + padding 上下8*2）
    // 主按钮贴视频框左上角；为展开菜单预留底部空间
    let nl = vRect.left + MARGIN;
    let nt = vRect.top + MARGIN;
    nl = Math.max(vRect.left + MARGIN, Math.min(nl, vRect.right - BTN - MARGIN));
    nt = Math.max(vRect.top + MARGIN, Math.min(nt, vRect.bottom - BTN - MARGIN));
    ball.style.left = nl + 'px';
    ball.style.top  = nt + 'px';
    ball.style.right = 'auto';
    ball.style.bottom = 'auto';
    // 同步校准菜单展开方向（不强制收起，仅校准方向）
    try{
        const btnGroup = ball.querySelector('.fb-btn-group');
        const bRect = ball.getBoundingClientRect();
        if(btnGroup && btnGroup.style.display !== 'none'){
            const spaceBelow = vRect.bottom - (bRect.top + BTN);
            if(spaceBelow < MENU_H + 8){
                // 下方空间不足，翻转到主按钮上方
                btnGroup.style.top = 'auto';
                btnGroup.style.bottom = 'calc(100% + 8px)';
            }else{
                btnGroup.style.top = 'calc(100% + 8px)';
                btnGroup.style.bottom = 'auto';
            }
        }
    }catch(e){}
}
function updateFloatBallVisibility(){
    const ball = document.querySelector('#hhkan-float-ball');
    if(!ball) return;
    if(hasVideoElement()){
        ball.style.display = 'flex';
        // 视频框放大/缩小/移动/切换时，始终重新对齐到视频框左上角
        const vRect = getVideoBounds();
        if(vRect && vRect.width > 0 && vRect.height > 0){
            // 用位置+尺寸拼 key，检测视频框是否发生变化（含首次/切换）
            const key = `${Math.round(vRect.left)},${Math.round(vRect.top)},${Math.round(vRect.width)},${Math.round(vRect.height)}`;
            const bRect = ball.getBoundingClientRect();
            const inVideoBox = (
                bRect.right  > vRect.left  + 4 &&
                bRect.left   < vRect.right  - 4 &&
                bRect.bottom > vRect.top    + 4 &&
                bRect.top    < vRect.bottom - 4
            );
            if(!inVideoBox || key !== _lastVideoRectKey){
                _alignFloatBallToVideoTopRight(ball, vRect);
                _lastVideoRectKey = key;
            }
        }
    }else{
        ball.style.display = 'none';
        _lastVideoRectKey = '';
    }
}
function ensureFloatBall(){
    if(document.querySelector('#hhkan-float-ball')) {
        updateFloatBallVisibility();
        return;
    }
    createFloatBall();
}
function initFloatBallEvents(ball){
    let isDragging = false;
    let dragMoved = false;
    let startX, startY, startLeft, startTop;
    const mainBtn = ball.querySelector('.fb-main-btn');
    const btnGroup = ball.querySelector('.fb-btn-group');
    const container = ball.querySelector('.fb-container');
    if(globalPanelVisible){
        btnGroup.style.display = 'flex';
        ball.classList.add('fb-expanded');
    }else{
        btnGroup.style.display = 'none';
        ball.classList.remove('fb-expanded');
    }
    mainBtn.addEventListener('mousedown', (e)=>{
        if(e.button !== 0) return;
        if(e.target.closest('.fb-action-btn')) return;
        isDragging = true;
        dragMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = ball.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        ball.classList.add('fb-dragging');
        isHovering = true;
        cancelFadeTimer();
        ball.classList.remove('fb-faded');
        ball.classList.add('fb-visible');
        e.preventDefault();
        e.stopPropagation();
    });
    document.addEventListener('mousemove', (e)=>{
        if(!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if(Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        const newLeft = startLeft + dx;
        const newTop = startTop + dy;
        ball.style.left = newLeft + 'px';
        ball.style.top = newTop + 'px';
        ball.style.right = 'auto';
        ball.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', (e)=>{
        if(!isDragging) return;
        isDragging = false;
        ball.classList.remove('fb-dragging');
        if(dragMoved){
            const rect = ball.getBoundingClientRect();
            saveFloatBallPos({
                left: rect.left,
                top: rect.top,
                side: rect.left > window.innerWidth * 0.5 ? 'right' : 'left'
            });
        }
        setTimeout(()=>{
            dragMoved = false;
        }, 0);
        isHovering = false;
        startFadeTimer(ball);
    });
    mainBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        if(dragMoved){
            dragMoved = false;
            return;
        }
        globalPanelVisible = !globalPanelVisible;
        if(globalPanelVisible){
            // 根据视频框底部剩余空间，自动决定菜单展开方向，确保整体落在视频框左上角区域内
            try{
                const vRect = getVideoBounds();
                const bRect = ball.getBoundingClientRect();
                const BTN = 64;
                const MENU_H = 200; // 竖排四按钮高度
                if(vRect && vRect.width > 0 && vRect.height > 0){
                    const spaceBelow = vRect.bottom - (bRect.top + BTN);
                    if(spaceBelow < MENU_H + 8){
                        // 底部空间不足：菜单改为向上展开（主按钮上方）
                        btnGroup.style.top = 'auto';
                        btnGroup.style.bottom = 'calc(100% + 8px)';
                    }else{
                        // 空间充足：菜单向下展开（主按钮下方，左对齐）
                        btnGroup.style.top = 'calc(100% + 8px)';
                        btnGroup.style.bottom = 'auto';
                    }
                }
            }catch(e){}
            btnGroup.style.display = 'flex';
            ball.classList.add('fb-expanded');
            showFloatTip('已展开菜单');
        }else{
            btnGroup.style.display = 'none';
            ball.classList.remove('fb-expanded');
            showFloatTip('已收起菜单');
        }
        isHovering = true;
        cancelFadeTimer();
        ball.classList.remove('fb-faded');
        ball.classList.add('fb-visible');
    });
    // 上一集 / 下一集 / 选集 / 设置 四个按钮
    ball.querySelectorAll('.fb-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const action = btn.dataset.action;
            if(action === 'prev'){
                navigateEpisode(-1);
            }else if(action === 'next'){
                navigateEpisode(1);
            }else if(action === 'episodes'){
                // 打开选集前先自动检测一次，使"上次选择"栏立即反映当前线路/集数
                autoDetectAndNotify();
                const lines = extractAllLines();
                if(lines.length === 0){
                    showFloatTip('未检测到选集列表，请确认当前在播放页');
                }else{
                    buildEpisodeModal(lines);
                    const isMovie = lines[0] && lines[0].isMovie;
                    showFloatTip(isMovie ?
                        `电影模式：${lines.length}条播放线路` :
                        `检测到 ${lines.length} 条线路，共 ${lines.reduce((s,l)=>s+l.total,0)} 集`
                    );
                }
            }else if(action === 'settings'){
                openPlayerSettingModal(true);
                showFloatTip('已打开播放设置');
            }
        });
    });
    ball.addEventListener('mouseenter', ()=>{
        isHovering = true;
        cancelFadeTimer();
        ball.classList.remove('fb-faded');
        ball.classList.add('fb-hover');
        ball.classList.add('fb-visible');
    });
    ball.addEventListener('mouseleave', ()=>{
        isHovering = false;
        ball.classList.remove('fb-hover');
        startFadeTimer(ball);
    });
    // 注：不再监听"球周围 60px  proximity"的全局 mousemove——
    // 严格按"鼠标是否真正触碰（mouseenter/leave）"判断是否降级，
    // 避免鼠标仅在球附近移动就阻止 2.5s 后的透明度降级。
    document.addEventListener('click', (e)=>{
        if(!globalPanelVisible) return;
        if(!ball.contains(e.target)){
            globalPanelVisible = false;
            btnGroup.style.display = 'none';
            ball.classList.remove('fb-expanded');
        }
    });
}
function showFloatTip(text){
    let tip = document.querySelector('#fb-toast');
    if(!tip){
        tip = document.createElement('div');
        tip.id = 'fb-toast';
        const fsEl = getFullscreenElement();
        if(fsEl) fsEl.appendChild(tip);
        else document.body.appendChild(tip);
    }
    const ball = document.querySelector('#hhkan-float-ball');
    if(ball){
        const rect = ball.getBoundingClientRect();
        tip.style.left = (rect.right + 8) + 'px';
        tip.style.top = (rect.top + rect.height/2 - 14) + 'px';
    }
    tip.textContent = text;
    tip.classList.add('fb-toast-show');
    setTimeout(()=>{ if(tip) tip.classList.remove('fb-toast-show'); }, 2500);
}
function handleFullscreenChange(){
    const ball = document.querySelector('#hhkan-float-ball');
    const fsEl = getFullscreenElement();
    if(fsEl){
        if(ball && !fsEl.contains(ball)){
            try{
                fsEl.appendChild(ball);
            }catch(e){
                if(ball.parentNode) ball.remove();
                createFloatBall();
                return;
            }
        }
        fsEl.style.overflow = 'visible';
        if(ball){
            ball.style.zIndex = '2147483647';
            ball.style.display = hasVideoElement() ? 'flex' : 'none';
            ball.classList.add('fb-visible');
            ball.classList.remove('fb-faded');
            isHovering = true;
            cancelFadeTimer();
            const btnGroup = ball.querySelector('.fb-btn-group');
            if(btnGroup && globalPanelVisible){
                btnGroup.style.display = 'flex';
            }
        }
        updateFloatBallVisibility();
        // 全屏进入后，按全屏视频框重新对齐到左上角
        const _fsVRect = getVideoBounds();
        if(ball && _fsVRect && _fsVRect.width > 0 && _fsVRect.height > 0){
            _alignFloatBallToVideoTopRight(ball, _fsVRect);
            _lastVideoRectKey = `${Math.round(_fsVRect.left)},${Math.round(_fsVRect.top)},${Math.round(_fsVRect.width)},${Math.round(_fsVRect.height)}`;
        }
        const existingModal = document.querySelector('#episode-modal-mask');
        if(existingModal && !fsEl.contains(existingModal)){
            fsEl.appendChild(existingModal);
        }
        const existingSetting = document.querySelector('#player-setting-mask');
        if(existingSetting && !fsEl.contains(existingSetting)){
            fsEl.appendChild(existingSetting);
        }
        const existingRec = document.querySelector('#recommend-modal-mask');
        if(existingRec && !fsEl.contains(existingRec)){
            fsEl.appendChild(existingRec);
        }
    }else{
        if(ball){
            if(ball.parentNode && ball.parentNode !== document.body){
                try{
                    document.body.appendChild(ball);
                }catch(e){
                    ball.remove();
                    createFloatBall();
                    return;
                }
            }else if(!ball.parentNode){
                document.body.appendChild(ball);
            }
            updateFloatBallVisibility();
            const btnGroup = ball.querySelector('.fb-btn-group');
            if(btnGroup && globalPanelVisible){
                btnGroup.style.display = 'flex';
            }
            isHovering = false;
            startFadeTimer(ball);
        }
        const existingModal = document.querySelector('#episode-modal-mask');
        if(existingModal && existingModal.parentNode !== document.body){
            try{
                document.body.appendChild(existingModal);
            }catch(e){
                existingModal.remove();
            }
        }
        const existingSetting = document.querySelector('#player-setting-mask');
        if(existingSetting && existingSetting.parentNode !== document.body){
            try{
                document.body.appendChild(existingSetting);
            }catch(e){
                existingSetting.remove();
            }
        }
        const existingRec = document.querySelector('#recommend-modal-mask');
        if(existingRec && existingRec.parentNode !== document.body){
            try{
                document.body.appendChild(existingRec);
            }catch(e){
                existingRec.remove();
            }
        }
    }
}
// ==================== UI构建 ====================
function buildUI() {
    ensureFloatBall();
    if(document.querySelector("#pake-window-top-bar")) return;
    // ========== CSS样式 ==========
    css = document.createElement("style");
    css.textContent = `
/* ==================== 开屏动画样式 ==================== */
#hhkan-splash-mask{
    position:fixed;inset:0;z-index:2147483647;
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#0f0c29 0%,#302b63 45%,#24243e 100%);
    overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    transition:opacity .65s ease;
}
#hhkan-splash-mask.splash-fadeout{opacity:0;pointer-events:none;}
.splash-bg{position:absolute;inset:0;}
.splash-glow{
    position:absolute;left:50%;top:50%;width:520px;height:520px;border-radius:50%;
    transform:translate(-50%,-50%);
    background:radial-gradient(circle,rgba(120,100,255,.35) 0%,rgba(120,100,255,0) 70%);
    animation:glowPulse 3s ease-in-out infinite alternate;
}
@keyframes glowPulse{from{transform:translate(-50%,-50%) scale(.85);opacity:.7;}to{transform:translate(-50%,-50%) scale(1.15);opacity:1;}}
.splash-stars{position:absolute;inset:0;pointer-events:none;}
.splash-star{position:absolute;border-radius:50%;background:rgba(255,255,255,.9);box-shadow:0 0 5px rgba(255,255,255,.7),0 0 10px rgba(180,200,255,.35);}
@keyframes starTwinkle{from{opacity:.25;transform:scale(.6);}to{opacity:1;transform:scale(1.25);}}
.splash-meteors{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.splash-meteor{position:absolute;left:-160px;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 6px #fff,0 0 14px #b4d6ff;opacity:0;transform:rotate(-35deg);}
.splash-meteor::after{content:'';position:absolute;left:2px;top:1px;width:var(--len,120px);height:2px;background:linear-gradient(90deg,rgba(255,255,255,.0) 0%,rgba(255,255,255,.85) 60%,rgba(180,210,255,.0) 100%);transform:rotate(35deg);transform-origin:left center;}
@keyframes meteorFall{0%{opacity:0;left:-160px;}12%{opacity:1;}70%{opacity:1;}100%{opacity:0;left:120vw;}}
.splash-balloons{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.splash-balloon{
    position:absolute;bottom:-120px;border-radius:50% 50% 48% 48%/56% 56% 44% 44%;
    opacity:0;transform:translateY(0) translateX(0);
    animation:balloonRise 6s ease-out forwards,balloonSway 3s ease-in-out infinite alternate;
}
.splash-balloon::after{
    content:'';position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);
    width:1.5px;height:26px;background:rgba(255,255,255,.5);border-radius:1px;
}
@keyframes balloonRise{
    0%{opacity:0;transform:translateY(0) scale(.7);}
    12%{opacity:1;}
    100%{opacity:.95;transform:translateY(-115vh) scale(1);}
}
@keyframes balloonSway{
    from{margin-left:calc(var(--sway,30px) * -1);}
    to{margin-left:var(--sway,30px);}
}
.splash-content{
    position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;
    gap:18px;padding:24px;text-align:center;color:#fff;
}
.splash-logo{display:flex;align-items:center;gap:12px;font-size:46px;font-weight:900;letter-spacing:4px;
    text-shadow:0 4px 22px rgba(120,100,255,.55);}
.splash-logo-icon{font-size:52px;animation:logoBounce 1.4s ease-in-out infinite alternate;}
@keyframes logoBounce{from{transform:translateY(0) rotate(-4deg);}to{transform:translateY(-8px) rotate(4deg);}}
.splash-logo-text{display:inline-block;min-width:1ch;border-right:3px solid rgba(255,255,255,.7);padding-right:4px;
    animation:caretBlink 1s step-end infinite;}
@keyframes caretBlink{50%{border-color:transparent;}}
.splash-sub{font-size:16px;color:rgba(255,255,255,.82);min-height:1.4em;letter-spacing:1px;}
.splash-url{font-size:13px;color:rgba(255,255,255,.55);letter-spacing:1px;font-family:ui-monospace,Menlo,Consolas,monospace;}
.splash-progress{width:300px;max-width:80vw;height:6px;background:rgba(255,255,255,.14);border-radius:4px;overflow:hidden;}
.splash-progress-bar{height:100%;width:0%;background:linear-gradient(90deg,#7f5cff,#5ad6ff);border-radius:4px;transition:width .25s ease;}
.splash-tip{font-size:13px;color:rgba(255,255,255,.6);min-height:1.3em;transition:opacity .3s;}
/* ========== 顶部栏 ========== */
#pake-window-top-bar{
    position:fixed;
    top:0;
    left:0;
    right:0;
    width:100%;
    height:${BAR_HEIGHT}px;
    z-index:999999999;
    display:flex;
    align-items:center;
    gap:6px;
    box-sizing:border-box;
    background:#1f1f23;
    padding:0 10px;
    pointer-events:none;
}
#pake-window-top-bar button{
    background:#383840;
    color:#fff;
    border:none;
    padding:2px 9px;
    font-size:12px;
    border-radius:3px;
    cursor:pointer;
    pointer-events:auto;
    transition: background 0.18s;
}
#pake-window-top-bar button:hover{
    background:#4e4e5a;
}
#pake-window-top-bar button.top-active{
    background:#444;
}
/*APP弹窗样式*/
#app-modal-mask{
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.65);
    z-index:1000000000;
    display:flex;
    align-items:center;
    justify-content:center;
}
#app-modal-box{
    background:#fff;
    color:#222;
    width:420px;
    padding:24px;
    border-radius:10px;
}
#app-modal-box h4{
    margin:0 0 12px 0;
    font-size:16px;
}
#app-modal-box .link-text{
    background:#f4f4f4;
    padding:8px 10px;
    border-radius:4px;
    word-break:break-all;
    margin-bottom:16px;
    font-size:13px;
}
#app-modal-buttons{
    display:flex;
    gap:8px;
    justify-content:flex-end;
}
#app-modal-buttons button{
    padding:6px 14px;
    border-radius:4px;
    border:none;
    cursor:pointer;
    font-size:13px;
}
.btn-know{background:#999;color:#fff;}
.btn-copy{background:#555;color:#fff;}
/*免责弹窗*/
#pake-disclaimer-mask{
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.78);
    z-index:999999999;
    display:flex;
    align-items:center;
    justify-content:center;
}
#pake-disclaimer-box{
    width:440px;
    background:#202026;
    border-radius:8px;
    padding:26px;
}
#pake-disclaimer-box h3{
    color:#ffffff;
    margin:0 0 14px 0;
    font-size:17px;
}
#pake-disclaimer-box p{
    color:#cccccc;
    font-size:14px;
    line-height:1.8;
    margin-bottom:22px;
}
#pake-btn-confirm{
    width:100%;
    padding:10px;
    background:#444;
    color:#fff;
    border:none;
    border-radius:5px;
    font-size:14px;
    cursor:pointer;
}
#pake-btn-confirm:hover{
    background:#555;
}
/* ========== 播放器设置弹窗 ========== */
#player-setting-mask{
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.55);
    z-index:2147483645;
    display:flex;
    align-items:flex-start;
    justify-content:flex-end;
    padding:80px 24px 24px 24px;
    box-sizing:border-box;
    animation: psMaskFadeIn 0.25s ease forwards;
}
@keyframes psMaskFadeIn{
    from{ opacity:0; }
    to  { opacity:1; }
}
#player-setting-box{
    background:#fff;
    width:420px;
    max-width:92vw;
    padding:24px;
    border-radius:12px;
    box-shadow:0 12px 48px rgba(0,0,0,0.4);
    animation: psBoxSlideLeftAnim 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    margin-left:auto;
}
@keyframes psBoxSlideLeftAnim{
    from{ opacity:0; transform:translateX(60px) scale(0.96); }
    to  { opacity:1; transform:translateX(0) scale(1); }
}
/* 从顶部栏按钮触发时使用从上往下动画 */
#player-setting-box.ps-slide-from-top{
    animation: psBoxSlideDown 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes psBoxSlideDown{
    from{ opacity:0; transform:translateY(-50px) scale(0.95); }
    to  { opacity:1; transform:translateY(0) scale(1); }
}
/* 从左弹出动画（悬浮球按钮触发时使用） */
#player-setting-box.ps-slide-from-left{
    animation: psBoxSlideLeftAnim 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
#player-setting-box h3{
    margin:0 0 16px 0;
    font-size:18px;
    color:#222;
}
.setting-group{
    margin-bottom:16px;
}
.setting-group label{
    display:block;
    font-size:14px;
    color:#333;
    margin-bottom:8px;
    font-weight:bold;
}
.fit-buttons{
    display:flex;
    gap:6px;
    flex-wrap:wrap;
}
.fit-buttons button{
    padding:5px 12px;
    border:1px solid #ddd;
    background:#f5f5f5;
    border-radius:5px;
    cursor:pointer;
    font-size:13px;
    transition:all 0.2s;
}
.fit-buttons button:hover{
    border-color:#666;
    color:#333;
}
.fit-buttons button.fit-active{
    background:#333;
    color:#fff;
    border-color:#333;
}
.setting-group input[type="range"]{
    width:100%;
    margin-top:4px;
}
.setting-desc{
    font-size:12px;
    color:#999;
    margin-bottom:16px;
    line-height:1.6;
}
.setting-buttons{
    display:flex;
    justify-content:flex-end;
}
.setting-buttons button{
    padding:7px 20px;
    background:#333;
    color:#fff;
    border:none;
    border-radius:6px;
    cursor:pointer;
    font-size:14px;
}
.setting-buttons button:hover{
    background:#555;
}
/* ========== 本地视频播放器弹窗 ========== */
#local-player-mask{
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.85);
    z-index:2147483647;
    display:flex;
    align-items:center;
    justify-content:center;
    animation: lpMaskFadeIn 0.3s ease forwards;
}
@keyframes lpMaskFadeIn{
    from{ opacity:0; }
    to  { opacity:1; }
}
#local-player-box{
    width:96vw;
    height:94vh;
    background:#0a0a0a;
    border-radius:12px;
    overflow:hidden;
    display:flex;
    flex-direction:column;
    box-shadow:0 16px 64px rgba(0,0,0,0.6);
    animation: lpBoxSlideDown 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes lpBoxSlideDown{
    from{ opacity:0; transform:translateY(-80px) scale(0.97); }
    to  { opacity:1; transform:translateY(0) scale(1); }
}
#local-player-box .lp-header{
    display:flex;
    align-items:center;
    padding:10px 16px;
    background:#1a1a1a;
    gap:10px;
    flex-shrink:0;
    border-bottom:1px solid #2a2a2a;
}
#local-player-box .lp-title{
    font-size:14px;
    color:#eee;
    font-weight:bold;
    flex:1;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
}
#local-player-box .lp-header button{
    background:#333;
    color:#fff;
    border:none;
    padding:5px 12px;
    font-size:12px;
    border-radius:5px;
    cursor:pointer;
    transition:background 0.2s;
}
#local-player-box .lp-header button:hover{
    background:#555;
}
#local-player-box .lp-header .lp-btn-import{
    background:#1976d2;
}
#local-player-box .lp-header .lp-btn-import:hover{
    background:#1565c0;
}
#local-player-box .lp-close{
    background:rgba(255,255,255,0.1) !important;
    width:30px;
    height:30px;
    padding:0 !important;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:16px;
    border-radius:50% !important;
}
#local-player-box .lp-close:hover{
    background:rgba(255,255,255,0.25) !important;
}
#local-player-box .lp-header .lp-btn-clear-cur{
    background:#e67e22;
}
#local-player-box .lp-header .lp-btn-clear-cur:hover{
    background:#cf6c1a;
}
#local-player-box .lp-header .lp-btn-clear-all{
    background:#c0392b;
}
#local-player-box .lp-header .lp-btn-clear-all:hover{
    background:#a93226;
}
#local-player-box .lp-body{
    flex:1;
    display:flex;
    min-height:0;
}
#local-player-box .lp-video-area{
    flex:1;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#000;
    position:relative;
    min-width:0;
}
#local-player-box .lp-video-area video{
    width:100%;
    height:100%;
    object-fit:contain;
    background:#000;
}
#local-player-box .lp-video-area .lp-empty{
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    color:#888;
    gap:16px;
    padding:40px;
    text-align:center;
}
#local-player-box .lp-video-area .lp-empty .lp-empty-icon{
    font-size:64px;
    opacity:0.5;
}
#local-player-box .lp-video-area .lp-empty p{
    font-size:15px;
    margin:0;
    line-height:1.6;
}
#local-player-box .lp-video-area .lp-empty .lp-empty-btn{
    margin-top:8px;
    padding:10px 24px;
    background:#1976d2;
    color:#fff;
    border:none;
    border-radius:8px;
    font-size:14px;
    cursor:pointer;
    transition:background 0.2s;
}
#local-player-box .lp-video-area .lp-empty .lp-empty-btn:hover{
    background:#1565c0;
}
#local-player-box .lp-playlist{
    width:240px;
    background:#141414;
    border-left:1px solid #2a2a2a;
    display:flex;
    flex-direction:column;
    flex-shrink:0;
}
#local-player-box .lp-playlist-header{
    padding:10px 14px;
    font-size:13px;
    color:#aaa;
    border-bottom:1px solid #2a2a2a;
    flex-shrink:0;
    display:flex;
    align-items:center;
    justify-content:space-between;
}
#local-player-box .lp-playlist-header .lp-count{
    background:#333;
    color:#fff;
    font-size:11px;
    padding:1px 8px;
    border-radius:10px;
}
#local-player-box .lp-playlist-list{
    flex:1;
    overflow-y:auto;
    padding:6px;
}
#local-player-box .lp-playlist-list::-webkit-scrollbar{
    width:5px;
}
#local-player-box .lp-playlist-list::-webkit-scrollbar-thumb{
    background:#444;
    border-radius:3px;
}
#local-player-box .lp-playlist-item{
    padding:8px 10px;
    border-radius:6px;
    font-size:13px;
    color:#ccc;
    cursor:pointer;
    transition:all 0.15s;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    display:flex;
    align-items:center;
    gap:6px;
}
#local-player-box .lp-playlist-item:hover{
    background:#2a2a2a;
    color:#fff;
}
#local-player-box .lp-playlist-item.lp-playing{
    background:#1976d2;
    color:#fff;
    font-weight:bold;
}
#local-player-box .lp-playlist-item .lp-item-icon{
    font-size:14px;
    flex-shrink:0;
}
#local-player-box .lp-playlist-item .lp-item-name{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
}
#local-player-box .lp-playlist-empty{
    padding:20px 14px;
    font-size:12px;
    color:#666;
    text-align:center;
    line-height:1.6;
}
#local-player-box .lp-file-input{
    display:none;
}
/* ========== 悬浮球 ========== */
#hhkan-float-ball{
    position:fixed !important;
    z-index:2147483640 !important;
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:grab;
    user-select:none;
    transition: transform 0.25s ease, box-shadow 0.25s ease, opacity 0.5s ease;
    opacity:1 !important;
    pointer-events:auto !important;
    overflow:visible;
    background:transparent;
    border:none;
    width:auto;
    height:auto;
}
#hhkan-float-ball:hover{
    opacity:1 !important;
}
#hhkan-float-ball.fb-dragging{
    cursor:grabbing;
    transform:scale(1.05);
    opacity:0.95 !important;
    transition:none;
}
#hhkan-float-ball.fb-visible{
    opacity:1 !important;
}
#hhkan-float-ball.fb-faded{
    opacity:0.3 !important;
}
#hhkan-float-ball.fb-faded:hover{
    opacity:1 !important;
}
/* 每日推荐弹窗打开时隐藏悬浮球（弹窗关闭后移除该类恢复显示） */
#hhkan-float-ball.fb-hidden-by-modal{
    display:none !important;
    opacity:0 !important;
    pointer-events:none !important;
}
.fb-container{
    position:relative;
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:8px;
    padding:6px;
    background:rgba(66,66,66,0.2);
    border-radius:30px;
    transition: background 0.3s;
}
#hhkan-float-ball:hover .fb-container{
    background:rgba(66,66,66,0.35);
}
#hhkan-float-ball.fb-expanded .fb-container{
    background:rgba(66,66,66,0.4);
}
.fb-main-btn{
    width:52px;
    height:52px;
    display:flex;
    align-items:center;
    justify-content:center;
    cursor:pointer;
    border-radius:50%;
    z-index:2;
    position:relative;
    pointer-events:auto;
    background:#424242;
    border:2px solid #555;
    box-shadow:0 3px 12px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.3);
    transition: transform 0.2s, background 0.2s, box-shadow 0.2s;
    flex-shrink:0;
}
.fb-main-btn:hover{
    background:#4e4e4e;
    transform:scale(1.12);
    box-shadow:0 6px 20px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
}
.fb-main-btn .fb-icon{
    font-size:24px;
    line-height:1;
    color:#ffffff;
    text-shadow:0 1px 2px rgba(0,0,0,0.5);
}
.fb-btn-group{
    position:absolute;
    top:calc(100% + 8px);
    left:0;
    right:auto;
    display:flex;
    flex-direction:column;
    align-items:stretch;
    gap:6px;
    padding:8px;
    background:rgba(30,30,30,0.92);
    border:1px solid rgba(255,255,255,0.08);
    border-radius:14px;
    box-shadow:0 8px 24px rgba(0,0,0,0.45);
    pointer-events:auto;
    animation: fbSlideInDown 0.25s ease;
    z-index:2;
    white-space:nowrap;
}
@keyframes fbSlideInDown{
    from{ opacity:0; transform:translateY(-10px); }
    to  { opacity:1; transform:translateY(0); }
}
.fb-action-btn{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:4px;
    padding:0 14px;
    height:40px;
    width:100%;
    min-width:80px;
    box-sizing:border-box;
    border:none;
    border-radius:20px;
    font-size:13px;
    font-weight:bold;
    cursor:pointer;
    color:#fff;
    white-space:nowrap;
    box-shadow:0 2px 10px rgba(0,0,0,0.35);
    transition:transform 0.2s, box-shadow 0.2s, background 0.2s;
}
.fb-action-btn:hover{
    transform:scale(1.08);
    box-shadow:0 4px 16px rgba(0,0,0,0.45);
}
/* 选集按钮 - 绿色 */
.fb-btn-episodes{
    background:linear-gradient(135deg, #43a047, #2e7d32);
}
.fb-btn-episodes:hover{
    background:linear-gradient(135deg, #4caf50, #388e3c);
}
/* 设置按钮 - 橙色 */
.fb-btn-settings{
    background:linear-gradient(135deg, #fb8c00, #e65100);
}
.fb-btn-settings:hover{
    background:linear-gradient(135deg, #ff9800, #f57c00);
}
/* 上一集按钮 - 蓝色 */
.fb-btn-prev{
    background:linear-gradient(135deg, #1e88e5, #1565c0);
}
.fb-btn-prev:hover{
    background:linear-gradient(135deg, #2196f3, #1976d2);
}
/* 下一集按钮 - 紫色 */
.fb-btn-next{
    background:linear-gradient(135deg, #8e24aa, #6a1b9a);
}
.fb-btn-next:hover{
    background:linear-gradient(135deg, #9c27b0, #7b1fa2);
}
.fb-btn-icon{
    font-size:14px;
}
.fb-btn-label{
    font-size:12px;
    letter-spacing:0.5px;
}
#fb-toast{
    position:fixed;
    z-index:2147483646;
    background:rgba(0,0,0,0.8);
    color:#fff;
    padding:6px 14px;
    border-radius:6px;
    font-size:12px;
    pointer-events:none;
    opacity:0;
    transition:opacity 0.3s;
    max-width:280px;
}
#fb-toast.fb-toast-show{
    opacity:1;
}
/* ========== 自动检测提示条 ========== */
#hhkan-detect-bar{
    position:fixed;left:50%;top:36px;transform:translateX(-50%) translateY(-16px);
    z-index:2147483645;
    background:linear-gradient(135deg,rgba(30,144,255,.92),rgba(0,200,180,.92));
    color:#fff;font-size:13px;font-weight:600;letter-spacing:.5px;
    padding:8px 18px;border-radius:20px;box-shadow:0 6px 22px rgba(0,120,212,.35);
    display:flex;align-items:center;gap:8px;pointer-events:auto;
    opacity:0;transition:opacity .35s ease, transform .35s ease;
    max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
#hhkan-detect-bar.hd-show{opacity:1;transform:translateX(-50%) translateY(0);}
#hhkan-detect-bar .hd-close{
    cursor:pointer;font-size:12px;opacity:.85;margin-left:4px;padding:0 2px;
}
#hhkan-detect-bar .hd-close:hover{opacity:1;}
/* ========== 选集弹窗 ========== */
/* 正序/倒序切换按钮 */
.ep-order-btn{
    margin-left:auto;
    margin-right:6px;
    padding:4px 12px;
    font-size:12px;
    color:#e65100;
    background:#fff3e0;
    border:1px solid #ffcc80;
    border-radius:14px;
    cursor:pointer;
    transition:background .2s, color .2s;
    white-space:nowrap;
}
.ep-order-btn:hover{ background:#ffe0b2; color:#bf360c; }
/* 自动滚动到当前集时的高亮提示 */
.ep-item.ep-scroll-hint{
    animation:epScrollHint 1.8s ease;
    box-shadow:0 0 0 2px #ff9800, 0 0 12px rgba(255,152,0,.6);
}
@keyframes epScrollHint{
    0%  { background:#ff9800; color:#fff; transform:scale(1.06); box-shadow:0 0 0 2px #ff9800, 0 0 14px rgba(255,152,0,.7); }
    60% { background:#ffb74d; color:#fff; }
    100%{ transform:scale(1); }
}
#episode-modal-mask{
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.5);
    z-index:2147483640;
    display:flex;
    align-items:flex-start;
    justify-content:flex-end;
    padding:80px 24px 24px 24px;
    box-sizing:border-box;
    animation: epMaskFadeIn 0.25s ease forwards;
}
@keyframes epMaskFadeIn{
    from{ opacity:0; }
    to  { opacity:1; }
}
#episode-modal-box{
    background:#ffffff;
    width:600px;
    max-width:92vw;
    max-height:calc(100vh - 104px);
    border-radius:14px;
    overflow:hidden;
    display:flex;
    flex-direction:column;
    box-shadow:0 12px 48px rgba(0,0,0,0.35);
    animation: epBoxSlideLeft 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    margin-left:auto;
}
@keyframes epBoxSlideLeft{
    from{ opacity:0; transform:translateX(60px) scale(0.96); }
    to  { opacity:1; transform:translateX(0) scale(1); }
}
.ep-header{
    display:flex;
    align-items:center;
    padding:14px 18px;
    background:#f5f5f5;
    color:#222;
    gap:12px;
    border-bottom:1px solid #e0e0e0;
}
.ep-title{
    font-size:17px;
    font-weight:bold;
    flex-shrink:0;
    color:#222;
}
.ep-count{
    font-size:13px;
    opacity:0.8;
    flex:1;
    color:#555;
}
.ep-count b{
    color:#e65100;
    font-size:15px;
}
.ep-close{
    background:rgba(0,0,0,0.08);
    border:none;
    color:#333;
    width:28px;
    height:28px;
    border-radius:50%;
    cursor:pointer;
    font-size:16px;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:background 0.2s;
}
.ep-close:hover{
    background:rgba(0,0,0,0.18);
}
.ep-current-info{
    padding:8px 18px;
    font-size:12px;
    color:#666;
    background:#fafafa;
    border-bottom:1px solid #eee;
    word-break:break-all;
}
/* 影片信息卡：标题 + 年份 + 简介 */
.ep-movie-card{
    display:flex;
    gap:12px;
    padding:12px 18px;
    background:linear-gradient(135deg,#fff8f0 0%,#fff3e0 100%);
    border-bottom:1px solid #ffe0b2;
}
.ep-movie-poster{
    flex:0 0 60px;
    width:60px;
    align-self:flex-start;
}
.ep-movie-poster-img{
    width:60px;height:84px;
    object-fit:cover;
    border-radius:8px;
    display:block;
    box-shadow:0 2px 8px rgba(255,112,67,0.25);
    background:#eee;
}
.ep-movie-poster-placeholder{
    width:60px;height:84px;
    border-radius:8px;
    background:linear-gradient(135deg,#ff8a65,#ff7043);
    color:#fff;
    font-size:28px;
    display:flex;
    align-items:center;
    justify-content:center;
    box-shadow:0 2px 8px rgba(255,112,67,0.25);
}
.ep-movie-meta{
    flex:1;
    min-width:0;
    display:flex;
    flex-direction:column;
    gap:4px;
}
.ep-movie-title{
    font-size:16px;
    font-weight:bold;
    color:#222;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    display:flex;
    align-items:center;
    flex-wrap:wrap;
    gap:6px;
}
.ep-movie-year{
    font-size:13px;
    font-weight:normal;
    color:#e65100;
    margin-left:0;
}
.ep-movie-genre{
    font-size:11px;
    font-weight:normal;
    color:#fff;
    background:#ff8a65;
    padding:1px 7px;
    border-radius:10px;
    white-space:nowrap;
}
.ep-movie-intro{
    font-size:12px;
    color:#666;
    line-height:1.5;
    display:-webkit-box;
    -webkit-line-clamp:3;
    -webkit-box-orient:vertical;
    overflow:hidden;
    text-overflow:ellipsis;
    transition:all 0.25s;
}
.ep-movie-intro.ep-intro-long{ /* 兼容：标记内容较长，实际显隐由 JS 按渲染高度判定 */ }
.ep-movie-intro.ep-intro-expanded{
    -webkit-line-clamp:unset;
    max-height:none;
    overflow:visible;
    text-overflow:clip;
    white-space:pre-wrap;
    word-break:break-word;
}
.ep-movie-intro.ep-intro-expanded{
    -webkit-line-clamp:unset;
    max-height:none;
    overflow:auto;
    white-space:pre-wrap;
    word-break:break-word;
}
.ep-intro-toggle{
    align-self:flex-start;
    font-size:11px;
    color:#e65100;
    background:transparent;
    border:1px solid #ffccbc;
    border-radius:10px;
    padding:1px 8px;
    cursor:pointer;
    margin-top:2px;
}
.ep-intro-toggle:hover{ background:#fff3e0; }
.ep-intro-toggle[hidden]{ display:none; }
.ep-record-info{
    padding:6px 18px;
    font-size:12px;
    color:#e65100;
    background:#fff8e1;
    border-bottom:1px solid #ffe0b2;
    font-weight:bold;
}
.ep-line-tabs{
    display:flex;
    gap:6px;
    padding:10px 14px;
    background:#fafafa;
    border-bottom:1px solid #e8e8e8;
    overflow-x:auto;
    flex-shrink:0;
}
.ep-line-tab{
    padding:5px 12px;
    border-radius:16px;
    font-size:13px;
    cursor:pointer;
    white-space:nowrap;
    background:#eeeeee;
    border:1px solid #ddd;
    color:#555;
    transition:all 0.2s;
}
.ep-line-tab:hover{
    border-color:#999;
    color:#333;
    background:#e0e0e0;
}
.ep-line-tab.ep-line-active{
    background:#e65100;
    color:#fff;
    border-color:#e65100;
}
.ep-line-tab small{
    opacity:0.8;
    font-size:11px;
}
.ep-line-panel{
    padding:12px 14px;
    overflow-y:auto;
    flex:1;
    background:#ffffff;
}
.ep-line-info{
    font-size:14px;
    font-weight:bold;
    color:#e65100;
    margin-bottom:10px;
    padding-bottom:6px;
    border-bottom:1px dashed #e0e0e0;
}
.ep-grid{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(100px,1fr));
    gap:6px;
}
.ep-item{
    display:flex;
    align-items:center;
    justify-content:center;
    padding:8px 6px;
    border-radius:8px;
    background:#f0f0f0;
    border:1px solid #ddd;
    font-size:13px;
    color:#333;
    text-decoration:none;
    cursor:pointer;
    transition:all 0.18s;
    text-align:center;
    line-height:1.3;
    word-break:break-all;
    font-weight:500;
}
.ep-item.ep-selected{
    background:#e65100 !important;
    color:#fff !important;
    border-color:#e65100 !important;
    box-shadow:0 2px 8px rgba(230,81,0,0.4);
    font-weight:bold;
}
.ep-item:hover{
    background:#e65100;
    color:#fff;
    border-color:#e65100;
    transform:translateY(-1px);
    box-shadow:0 2px 8px rgba(230,81,0,0.3);
}
.ep-item:active{
    transform:scale(0.96);
}
.ep-footer{
    padding:8px 14px;
    font-size:11px;
    color:#999;
    text-align:center;
    background:#fafafa;
    border-top:1px solid #eee;
    flex-shrink:0;
}
/* ========== 每日推荐弹窗（z-index 高于悬浮球，置顶并遮挡悬浮球）========== */
#recommend-modal-mask{
    position:fixed;
    inset:0;
    background:#ffffff;
    z-index:2147483647;
    animation: recMaskFadeIn 0.35s ease forwards;
}
@keyframes recMaskFadeIn{
    from{ opacity:0; }
    to  { opacity:1; }
}
#recommend-modal-box{
    width:100%;
    height:100%;
    background:#ffffff;
    color:#222;
    display:flex;
    flex-direction:column;
    box-sizing:border-box;
    padding:32px 24px 80px 24px;
    animation: recBoxSlideDown 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes recBoxSlideDown{
    from{ opacity:0; transform:translateY(-60px); }
    to  { opacity:1; transform:translateY(0); }
}
#recommend-modal-box h4{
    margin:0 0 20px 0;
    font-size:20px;
}
.rec-wrap{
    flex:1;
    overflow-y:auto;
}
.rec-grid{
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(220px,1fr));
    gap:14px;
}
.rec-block-title{
    font-weight:bold;
    font-size:18px;
    margin:24px 0 12px;
    color:#333;
    padding-bottom:8px;
    border-bottom:1px solid #eee;
}
.rec-item{
    padding:10px 12px;
    cursor:pointer;
    border-radius:8px;
    font-size:15px;
    transition: all 0.22s ease;
    border:1px solid #e0e0e0;
    background:#fff;
}
.rec-item:hover{
    background:#f5f5f5;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border-color:#999;
}
.rec-item.rec-dynamic{
    border-left:4px solid #0078d4;
}
.rec-item.rec-cached{
    border-left:4px solid #e0e0e0;
}
.rank-1{color:#d32f2f;font-weight:bold;}
.rank-2{color:#e65100;font-weight:bold;}
.rank-3{color:#f9a825;font-weight:bold;}
.rank-normal{color:#666666;}
.rec-source-tag{
    display:inline-block;
    font-size:10px;
    padding:1px 6px;
    border-radius:3px;
    margin-left:4px;
    vertical-align:middle;
}
.rec-source-tag.dynamic{
    background:#e3f2fd;
    color:#0078d4;
}
.rec-source-tag.fallback{
    background:#f5f5f5;
    color:#999;
}
#rec-close-btn{
    position:absolute;
    right:24px;
    bottom:20px;
    padding:9px 20px;
    border:none;
    border-radius:8px;
    background:#444;
    color:#fff;
    cursor:pointer;
    font-size:15px;
}
#rec-close-btn:hover{
    background:#222;
}
.rec-loading{
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    padding:60px 20px;
    color:#555;
}
.rec-loading .mi-spinner{
    width:42px;
    height:42px;
    border:4px solid #e3f2fd;
    border-top-color:#0078d4;
    border-radius:50%;
    animation: miSpin 0.8s linear infinite;
    margin-bottom:16px;
}
@keyframes miSpin{
    to{ transform:rotate(360deg); }
}
        `;
    document.head.appendChild(css);
    // ========== 顶部栏 ==========
    topBar = document.createElement('div');
    topBar.id = "pake-window-top-bar";
    topBar.innerHTML = `
        <button id="btn-back">⬅️ 回退</button>
        <button id="btn-forward">➡️ 前进</button>
        <button id="btn-reload">🔄刷新</button>
        <button id="btn-recommend">🎬每日推荐</button>
        <button id="btn-local-play">📂本地播放</button>
        <button id="btn-topmost">📌 置顶窗口</button>
        <button id="btn-app">📱APP</button>
    `;
    document.body.appendChild(topBar);
    watchVideoElements();
}
document.body.addEventListener('click',(e)=>{
    const target = e.target;
    if(target.id === 'btn-back') history.back();
    else if(target.id === 'btn-forward') history.forward();
    else if(target.id === 'btn-reload') location.reload();
    else if(target.id === 'btn-recommend') openRecommendModal();
    else if(target.id === 'btn-player-set') openPlayerSettingModal(false);
    else if(target.id === 'btn-local-play') openLocalPlayerModal();
    else if(target.id === 'btn-app') openAppModal();
    else if(target.id === 'btn-topmost') toggleTopMost(target);
})
// ========== 每日推荐弹窗（从 hhkan0.com 动态获取）==========
async function openRecommendModal(){
    if(document.querySelector('#recommend-modal-mask')) return;
    if(!requestOpenModal('recommend-modal-mask')) return;
    const mask = document.createElement('div');
    mask.id = 'recommend-modal-mask';
    recommendModalDom = mask;
    // 先显示加载状态
    const msToMidnight = getNextMidnight();
    const hoursToGo = Math.floor(msToMidnight / 1000 / 3600);
    const minsToGo = Math.floor((msToMidnight / 1000 % 3600) / 60);
    mask.innerHTML = `
        <div id="recommend-modal-box">
            <h4>🎬 每日影视推荐｜每天 00:00 自动更新</h4>
            <div style="font-size:12px;color:#888;margin-bottom:14px;">
                ⏰ 下次自动更新倒计时：${hoursToGo}小时${minsToGo}分钟 | 今日日期：${getTodayStr()}
                <br>📡 数据源：hhkan0.com 实时抓取 + 本地随机生成
            </div>
            <div class="rec-wrap">
                <div class="rec-loading">
                    <div class="mi-spinner"></div>
                    <p>正在从 hhkan0.com 获取最新影片列表...</p>
                    <p class="mi-sub" style="font-size:12px;color:#999;margin-top:6px;">每天00:00自动刷新，保证名单不重复</p>
                </div>
            </div>
            <button id="rec-close-btn">关闭</button>
        </div>
    `;
    const fsEl = getFullscreenElement();
    if(fsEl) fsEl.appendChild(mask);
    else document.body.appendChild(mask);
    // 弹窗置顶显示：隐藏悬浮球，避免球叠在弹窗之上
    const ball = document.querySelector('#hhkan-float-ball');
    if(ball){
        ball.classList.add('fb-hidden-by-modal');
        ball.style.display = 'none';
    }
    const boxEl = mask.querySelector('#recommend-modal-box');
    boxEl.addEventListener('click',e=>e.stopPropagation());
    mask.querySelector('#rec-close-btn').onclick = (e)=>{
        e.stopPropagation();
        closeRecommendModal();
    };
    mask.onclick = (e)=>{
        if(e.target === mask) closeRecommendModal();
    };
    // 异步加载推荐数据
    try{
        const recData = await getDailyRecommend();
        renderRecommendContent(mask, recData);
    }catch(e){
        console.error('[每日推荐] 加载失败:', e);
        const fallback = generateFallbackRecommend();
        renderRecommendContent(mask, fallback);
    }
}
function renderRecommendContent(mask, recData){
    const sorted = {
        movie: sortByScoreDesc(recData.movie || []).slice(0,20),
        series: sortByScoreDesc(recData.series || []).slice(0,20),
        anime: sortByScoreDesc(recData.anime || []).slice(0,20),
        variety: sortByScoreDesc(recData.variety || []).slice(0,20),
        shortDrama: sortByScoreDesc(recData.shortDrama || []).slice(0,20)
    };
    const allItems = [
        ...(sorted.movie||[]),
        ...(sorted.series||[]),
        ...(sorted.anime||[]),
        ...(sorted.variety||[]),
        ...(sorted.shortDrama||[])
    ];
    const today = getTodayStr();
    const cacheDay = localStorage.getItem("rec_day");
    const isDynamic = cacheDay === today;
    let htmlStr = `<div id="recommend-modal-box">
        <h4>🎬 每日影视推荐｜按评分降序｜每天 00:00 自动更新</h4>
        <div style="font-size:12px;color:#888;margin-bottom:14px;">
            📅 更新日期：${today} ${isDynamic ? '| ✅ 今日已刷新' : '| 🔄 使用缓存'}
            | 📡 数据源：hhkan0.com 实时推送
            <br>💡 点击片名可直接搜索本站资源
        </div>
        <div class="rec-wrap">`;
    function renderBlock(titleName, list){
        if(!list || list.length === 0) return '';
        let block = `<div><div class="rec-block-title">${titleName} <span class="rec-source-tag ${isDynamic ? 'dynamic' : 'fallback'}">${isDynamic ? '🔴 实时' : '⚪ 缓存'}</span></div><div class="rec-grid">`;
        list.forEach((item,idx)=>{
            const rankNum = idx+1;
            let rankClass = "rank-normal";
            if(rankNum===1) rankClass="rank-1";
            else if(rankNum===2) rankClass="rank-2";
            else if(rankNum===3) rankClass="rank-3";
            block += `<div class="rec-item rec-dynamic" data-title="${item.title.replace(/"/g,'&quot;')}" data-score="${item.doubanScore}">
                <div style="display:flex;flex-direction:column;gap:2px;">
                    <div>
                        <span class="${rankClass}">${rankNum}.</span>
                        &nbsp;
                        <span>${item.title}</span>
                    </div>
                    <div style="font-size:13px;color:#666">⭐评分：${item.doubanScore}</div>
                </div>
            </div>`;
        })
        block += `</div></div>`;
        return block;
    }
    htmlStr += renderBlock("🎞 电影", sorted.movie);
    htmlStr += renderBlock("📺 连续剧", sorted.series);
    htmlStr += renderBlock("🎏 动漫", sorted.anime);
    htmlStr += renderBlock("🎤 综艺", sorted.variety);
    htmlStr += renderBlock("📱 短剧", sorted.shortDrama);
    htmlStr += `</div><button id="rec-close-btn">关闭</button></div>`;
    mask.innerHTML = htmlStr;
    const boxEl = mask.querySelector('#recommend-modal-box');
    boxEl.addEventListener('click',e=>e.stopPropagation());
    mask.querySelectorAll('.rec-item').forEach(el=>{
        el.onclick = (e)=>{
            e.preventDefault();
            e.stopPropagation();
            const title = el.dataset.title;
            innerSearch(title,false);
        }
    })
    mask.querySelector('#rec-close-btn').onclick = (e)=>{
        e.stopPropagation();
        closeRecommendModal();
    };
    mask.onclick = (e)=>{
        if(e.target === mask) closeRecommendModal();
    };
    setTimeout(()=>{
        startFetchPosterQueue(allItems);
    }, 300);
}
// ==================== 本地视频播放器弹窗 ====================
let localPlayerState = {
    files: [],      // File 对象数组
    currentIndex: -1
};
function openLocalPlayerModal(){
    // 如果已打开，不再重复创建
    if(document.querySelector('#local-player-mask')) return;
    if(!requestOpenModal('local-player-mask')) return;
    const mask = document.createElement('div');
    mask.id = 'local-player-mask';
    mask.innerHTML = `
        <div id="local-player-box">
            <div class="lp-header">
                <span class="lp-title" id="lp-title">📂 本地视频播放器</span>
                <button class="lp-btn-import" id="lp-btn-import">➕ 导入视频</button>
                <button class="lp-btn-clear-cur" id="lp-btn-clear-cur" title="清除当前视频">🗑 清除当前</button>
                <button class="lp-btn-clear-all" id="lp-btn-clear-all" title="清除全部列表">🧹 清除全部</button>
                <button id="lp-btn-prev" title="上一个">⏮</button>
                <button id="lp-btn-next" title="下一个">⏭</button>
                <button class="lp-close" id="lp-btn-close" title="关闭">✕</button>
            </div>
            <div class="lp-body">
                <div class="lp-video-area" id="lp-video-area">
                    <div class="lp-empty" id="lp-empty">
                        <div class="lp-empty-icon">🎬</div>
                        <p>点击「导入视频」选择本地视频文件<br>支持 MP4 / WebM / Ogg / MKV 等格式</p>
                        <button class="lp-empty-btn" id="lp-empty-import">📂 选择视频文件</button>
                    </div>
                </div>
                <div class="lp-playlist">
                    <div class="lp-playlist-header">
                        <span>播放列表</span>
                        <span class="lp-count" id="lp-count">0</span>
                    </div>
                    <div class="lp-playlist-list" id="lp-playlist-list">
                        <div class="lp-playlist-empty">暂无视频<br>点击「导入视频」添加</div>
                    </div>
                </div>
            </div>
            <input type="file" class="lp-file-input" id="lp-file-input" accept="video/*" multiple>
        </div>
    `;
    const fsEl = getFullscreenElement();
    if(fsEl) fsEl.appendChild(mask);
    else document.body.appendChild(mask);
    // 隐藏悬浮球
    const ball = document.querySelector('#hhkan-float-ball');
    if(ball){
        ball.classList.add('fb-hidden-by-modal');
        ball.style.display = 'none';
    }
    const boxEl = mask.querySelector('#local-player-box');
    boxEl.addEventListener('click', e => e.stopPropagation());
    // 关闭
    const closeModal = () => {
        // 停止并释放视频 URL
        const video = mask.querySelector('#lp-video');
        if(video){
            video.pause();
            if(video.src && video.src.startsWith('blob:')){
                URL.revokeObjectURL(video.src);
            }
        }
        localPlayerState.files = [];
        localPlayerState.currentIndex = -1;
        mask.remove();
        // 恢复悬浮球
        if(ball){
            ball.classList.remove('fb-hidden-by-modal');
            ball.style.display = '';
            updateFloatBallVisibility();
        }
    };
    mask.querySelector('#lp-btn-close').onclick = (e) => {
        e.stopPropagation();
        closeModal();
    };
    mask.onclick = (e) => {
        if(e.target === mask) closeModal();
    };
    const fileInput = mask.querySelector('#lp-file-input');
    const triggerImport = () => fileInput.click();
    mask.querySelector('#lp-btn-import').onclick = (e) => {
        e.stopPropagation();
        triggerImport();
    };
    mask.querySelector('#lp-empty-import').onclick = (e) => {
        e.stopPropagation();
        triggerImport();
    };
    mask.querySelector('#lp-btn-prev').onclick = (e) => {
        e.stopPropagation();
        if(localPlayerState.files.length === 0) return;
        let idx = localPlayerState.currentIndex - 1;
        if(idx < 0) idx = localPlayerState.files.length - 1;
        playLocalVideo(mask, idx);
    };
    mask.querySelector('#lp-btn-next').onclick = (e) => {
        e.stopPropagation();
        if(localPlayerState.files.length === 0) return;
        let idx = localPlayerState.currentIndex + 1;
        if(idx >= localPlayerState.files.length) idx = 0;
        playLocalVideo(mask, idx);
    };
    // 清除当前视频：停止播放并释放 blob URL，从列表移除当前项
    mask.querySelector('#lp-btn-clear-cur').onclick = (e) => {
        e.stopPropagation();
        const idx = localPlayerState.currentIndex;
        if(idx < 0 || idx >= localPlayerState.files.length) return;
        if(!confirm('确定要移除当前正在播放的视频吗？')) return;
        // 释放当前视频的 blob URL
        const video = mask.querySelector('#lp-video');
        if(video){
            video.pause();
            if(video.src && video.src.startsWith('blob:')){
                URL.revokeObjectURL(video.src);
            }
            video.removeAttribute('src');
            video.load();
        }
        // 从数组移除
        localPlayerState.files.splice(idx, 1);
        if(localPlayerState.files.length === 0){
            // 列表已空：重置视频区域为空白状态
            localPlayerState.currentIndex = -1;
            if(video) videoAreaReset(mask);
        }else{
            // 优先播放被删项的原位置（若越界则取最后一项）
            let nextIdx = idx;
            if(nextIdx >= localPlayerState.files.length) nextIdx = localPlayerState.files.length - 1;
            playLocalVideo(mask, nextIdx);
        }
        renderPlaylist(mask);
        updateTitle(mask);
    };
    // 清除全部列表：停止播放、释放 blob URL、清空 files 与列表
    mask.querySelector('#lp-btn-clear-all').onclick = (e) => {
        e.stopPropagation();
        if(localPlayerState.files.length === 0) return;
        if(!confirm('确定要清空整个播放列表吗？此操作不可恢复。')) return;
        // 释放当前视频的 blob URL
        const video = mask.querySelector('#lp-video');
        if(video){
            video.pause();
            if(video.src && video.src.startsWith('blob:')){
                URL.revokeObjectURL(video.src);
            }
            video.removeAttribute('src');
            video.load();
        }
        localPlayerState.files = [];
        localPlayerState.currentIndex = -1;
        if(video) videoAreaReset(mask);
        renderPlaylist(mask);
        updateTitle(mask);
    };
    fileInput.onchange = (e) => {
        e.stopPropagation();
        const files = Array.from(e.target.files || []);
        if(files.length === 0) return;
        // 追加到列表（去重：同 name + size）
        const existingKeys = new Set(
            localPlayerState.files.map(f => `${f.name}|${f.size}`)
        );
        let added = 0;
        for(const f of files){
            const key = `${f.name}|${f.size}`;
            if(!existingKeys.has(key)){
                localPlayerState.files.push(f);
                existingKeys.add(key);
                added++;
            }
        }
        renderPlaylist(mask);
        updateTitle(mask);
        // 如果当前没有在播放，自动播放第一个新导入的
        if(localPlayerState.currentIndex < 0 && localPlayerState.files.length > 0){
            // 播放刚添加的第一个文件
            const firstNewIdx = localPlayerState.files.length - added;
            playLocalVideo(mask, firstNewIdx >= 0 ? firstNewIdx : 0);
        }
        // 重置 input，允许重复选择同一文件
        fileInput.value = '';
    };
}
function renderPlaylist(mask){
    const listEl = mask.querySelector('#lp-playlist-list');
    const countEl = mask.querySelector('#lp-count');
    const files = localPlayerState.files;
    countEl.textContent = String(files.length);
    if(files.length === 0){
        listEl.innerHTML = `<div class="lp-playlist-empty">暂无视频<br>点击「导入视频」添加</div>`;
        return;
    }
    let html = '';
    files.forEach((f, idx) => {
        const playingCls = idx === localPlayerState.currentIndex ? 'lp-playing' : '';
        const name = f.name.replace(/</g, '&lt;').replace(/"/g, '&quot;');
        html += `<div class="lp-playlist-item ${playingCls}" data-idx="${idx}">
            <span class="lp-item-icon">${idx === localPlayerState.currentIndex ? '▶️' : '🎞️'}</span>
            <span class="lp-item-name" title="${name}">${name}</span>
        </div>`;
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('.lp-playlist-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(item.dataset.idx, 10);
            playLocalVideo(mask, idx);
        };
    });
    // 滚动当前项到可见
    const cur = listEl.querySelector('.lp-playing');
    if(cur) cur.scrollIntoView({ block: 'nearest' });
}
function updateTitle(mask){
    const titleEl = mask.querySelector('#lp-title');
    const files = localPlayerState.files;
    if(files.length === 0){
        titleEl.textContent = '📂 本地视频播放器';
    }else{
        const cur = localPlayerState.currentIndex >= 0 ? localPlayerState.currentIndex + 1 : '-';
        titleEl.textContent = `📂 本地视频播放器（${cur}/${files.length}）`;
    }
}
// 清空视频区域，恢复为初始的「导入视频」空白提示界面
function videoAreaReset(mask){
    const videoArea = mask.querySelector('#lp-video-area');
    if(!videoArea) return;
    // 移除旧的 video 元素（如有）
    const old = videoArea.querySelector('#lp-video');
    if(old){
        old.pause();
        if(old.src && old.src.startsWith('blob:')){
            URL.revokeObjectURL(old.src);
        }
        old.remove();
    }
    // 恢复空白提示 DOM
    videoArea.innerHTML = `
        <div class="lp-empty" id="lp-empty">
            <div class="lp-empty-icon">🎬</div>
            <p>点击「导入视频」选择本地视频文件<br>支持 MP4 / WebM / Ogg / MKV 等格式</p>
            <button class="lp-empty-btn" id="lp-empty-import">📂 选择视频文件</button>
        </div>
    `;
    // 重新绑定空白区的导入按钮
    const emptyBtn = videoArea.querySelector('#lp-empty-import');
    if(emptyBtn){
        emptyBtn.onclick = (e) => {
            e.stopPropagation();
            const fi = mask.querySelector('#lp-file-input');
            if(fi) fi.click();
        };
    }
}
function playLocalVideo(mask, index){
    const files = localPlayerState.files;
    if(index < 0 || index >= files.length) return;
    const videoArea = mask.querySelector('#lp-video-area');
    const file = files[index];
    localPlayerState.currentIndex = index;
    // 释放旧的 blob URL
    const oldVideo = videoArea.querySelector('#lp-video');
    if(oldVideo && oldVideo.src && oldVideo.src.startsWith('blob:')){
        URL.revokeObjectURL(oldVideo.src);
    }
    const url = URL.createObjectURL(file);
    // 如果已有 video 元素则复用，否则创建
    let video = videoArea.querySelector('#lp-video');
    if(!video){
        videoArea.innerHTML = '';
        video = document.createElement('video');
        video.id = 'lp-video';
        video.controls = true;
        video.autoplay = true;
        video.preload = 'metadata';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'contain';
        video.style.background = '#000';
        videoArea.appendChild(video);
        // 播放结束自动下一个
        video.addEventListener('ended', () => {
            const next = localPlayerState.currentIndex + 1;
            if(next < localPlayerState.files.length){
                playLocalVideo(mask, next);
            }
        });
    }
    video.src = url;
    video.load();
    video.play().catch(err => console.warn('[本地播放] 自动播放被阻止：', err));
    // 注意：本地播放器独立运行，不应用站点播放器设置（画面比例/跳过片头片尾），
    // 始终保持默认的 contain 铺满行为，避免设置功能干扰本地视频播放。
    renderPlaylist(mask);
    updateTitle(mask);
}
// APP弹窗
function openAppModal(){
    if(document.querySelector('#app-modal-mask')) return;
    if(!requestOpenModal('app-modal-mask')) return;
    const mask = document.createElement('div');
    mask.id = 'app-modal-mask';
    mask.innerHTML = `
            <div id="app-modal-box">
                <h4>APP下载地址</h4>
                <div class="link-text">${APP_LINK}</div>
                <div id="app-modal-buttons">
                    <button class="btn-know">我知道了</button>
                    <button class="btn-copy">点击复制</button>
                </div>
            </div>
        `;
    document.body.appendChild(mask);
    mask.querySelector('#app-modal-box').addEventListener('click',e=>e.stopPropagation());
    mask.querySelector('.btn-know').onclick = (e)=>{
        e.stopPropagation();
        mask.remove();
    };
    mask.querySelector('.btn-copy').onclick = async (e)=>{
        e.stopPropagation();
        try{
            await navigator.clipboard.writeText(APP_LINK);
            alert("链接已复制到剪贴板");
        }catch(err){
            alert("复制失败，请手动复制");
        }
    };
    mask.onclick = (e)=>{
        if(e.target === mask) mask.remove();
    };
}
// 播放器设置弹窗
function openPlayerSettingModal(fromLeft){
    const old = document.querySelector('#player-setting-mask');
    if(old) old.remove();
    if(!requestOpenModal('player-setting-mask')) return;
    const setting = getPlayerSettings();
    const mask = document.createElement('div');
    mask.id = 'player-setting-mask';
    let html = `<div id="player-setting-box">
        <h3>⚙ 播放器设置</h3>`;
    html += `<div class="setting-group">
        <label>📐 画面比例</label>
        <div class="fit-buttons">`;
    const fits = [
        {k:"default",  t:"默认"},
        {k:"original", t:"原始"},
        {k:"stretch",  t:"拉伸"},
        {k:"fill",     t:"填充"},
        {k:"16:9",    t:"16:9"},
        {k:"4:3",     t:"4:3"}
    ];
    fits.forEach(f=>{
        const active = setting.videoFit === f.k ? 'fit-active' : '';
        html += `<button class="${active}" data-fit="${f.k}">${f.t}</button>`;
    });
    html += `</div></div>`;
    html += `<div class="setting-group">
        <label>⏩ 跳过片头（秒）</label>
        <input type="range" min="0" max="600" step="10" value="${setting.skipIntro}" id="set-skip-intro">
        <div class="setting-desc">当前值：<span id="skip-intro-val">${setting.skipIntro}</span> 秒（最长 10 分钟 = 600 秒）</div>
    </div>`;
    html += `<div class="setting-group">
        <label>⏭️ 跳过片尾（秒）</label>
        <input type="range" min="0" max="600" step="10" value="${setting.skipOutro}" id="set-skip-outro">
        <div class="setting-desc">当前值：<span id="skip-outro-val">${setting.skipOutro}</span> 秒（视频最后N秒自动跳过，最长 10 分钟 = 600 秒）</div>
    </div>`;
    html += `<div class="setting-buttons">
        <button id="setting-save-btn">保存设置</button>
    </div></div>`;
    mask.innerHTML = html;
    // 如果由悬浮球按钮触发，从左弹出；由顶部栏按钮触发，从上往下弹出
    const box = mask.querySelector('#player-setting-box');
    if(box){
        if(fromLeft){
            box.classList.add('ps-slide-from-left');
        }else{
            box.classList.add('ps-slide-from-top');
        }
    }
    const fsEl = getFullscreenElement();
    if(fsEl) fsEl.appendChild(mask);
    else document.body.appendChild(mask);
    mask.querySelectorAll('.fit-buttons button').forEach(btn=>{
        btn.onclick = ()=>{
            mask.querySelectorAll('.fit-buttons button').forEach(b=>b.classList.remove('fit-active'));
            btn.classList.add('fit-active');
        };
    });
    const introSlider = mask.querySelector('#set-skip-intro');
    const outroSlider = mask.querySelector('#set-skip-outro');
    introSlider.oninput = ()=> mask.querySelector('#skip-intro-val').textContent = introSlider.value;
    outroSlider.oninput = ()=> mask.querySelector('#skip-outro-val').textContent = outroSlider.value;
    mask.querySelector('#setting-save-btn').onclick = ()=>{
        const fitBtn = mask.querySelector('.fit-buttons button.fit-active');
        const fit = fitBtn ? fitBtn.dataset.fit : 'default';
        // 钳制在 0~600 秒（最长 10 分钟）
        let intro = parseInt(introSlider.value) || 0;
        let outro = parseInt(outroSlider.value) || 0;
        if(intro < 0) intro = 0; if(intro > 600) intro = 600;
        if(outro < 0) outro = 0; if(outro > 600) outro = 600;
        savePlayerSettings({videoFit:fit, skipIntro:intro, skipOutro:outro});
        // 仅对站点播放器 video 应用画面比例，不影响本地播放器
        document.querySelectorAll('video').forEach(v=>{
            if(!v.closest || !v.closest('#local-player-mask')){
                applyVideoFit(v, fit);
            }
        });
        showFloatTip('设置已保存');
        setTimeout(()=>mask.remove(), 800);
    };
    mask.onclick = (e)=>{ if(e.target===mask) mask.remove(); };
    mask.querySelector('#player-setting-box').addEventListener('click',e=>e.stopPropagation());
}
// TAURI窗口置顶
let isTopMost = false;
async function toggleTopMost(btn){
    if(!window.__TAURI__){
        alert("仅打包后的Pake软件可使用置顶功能，预览模式无效");
        return;
    }
    try{
        const win = window.__TAURI__.window.getCurrentWindow();
        isTopMost = !isTopMost;
        await win.setAlwaysOnTop(isTopMost);
        if(isTopMost){
            btn.textContent = "📌 取消置顶";
            btn.classList.add("top-active");
        }else{
            btn.textContent = "📌 置顶窗口";
            btn.classList.remove("top-active");
        }
    }catch(e){
        console.error(e);
        alert("设置置顶失败："+e.message);
    }
}
// 修正fixed元素被顶部栏遮挡
function fixAllFixedElements(){
    document.querySelectorAll('*').forEach(el=>{
        const pos = getComputedStyle(el).position;
        if(pos === 'fixed' || pos === 'sticky'){
            // 排除顶部栏、悬浮球、开屏遮罩，避免开屏被顶栏偏移挤压
            if(el.id === 'pake-window-top-bar' || el.id === 'hhkan-float-ball' || el.id === 'hhkan-splash-mask') return;
            const isVideoEl = el.tagName === 'VIDEO' || el.querySelector('video');
            const isFullScreen = !!document.fullscreenElement;
            if(isVideoEl || isFullScreen) return;
            el.style.setProperty('top', BAR_HEIGHT+'px', 'important');
        }
    })
}
// DOM监听自动重建UI
function startWatch(){
    if(observer) observer.disconnect();
    observer = new MutationObserver((mutations)=>{
        clearTimeout(observerTimer);
        observerTimer = setTimeout(()=>{
            ensureFloatBall();
            if(!document.querySelector("#pake-window-top-bar")) buildUI();
            fixAllFixedElements();
            updateFloatBallVisibility();
        },80);
    });
    observer.observe(document.documentElement, {childList:true, subtree:true});
    fixAllFixedElements();
}
// ========== 全屏事件监听 ==========
function bindFullscreenEvents(){
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    document.addEventListener('webkitbeginfullscreen', ()=>{
        const ball = document.querySelector('#hhkan-float-ball');
        if(ball){
            ball.style.display = hasVideoElement() ? 'flex' : 'none';
            ball.classList.add('fb-visible');
            ball.classList.remove('fb-faded');
            isHovering = true;
            cancelFadeTimer();
            const btnGroup = ball.querySelector('.fb-btn-group');
            if(btnGroup && globalPanelVisible){
                btnGroup.style.display = 'flex';
            }
        }
    });
    document.addEventListener('webkitendfullscreen', ()=>{
        handleFullscreenChange();
    });
}
// 窗口 resize：视频框存在时重新对齐到视频框左上角（放大/缩小均自适应）；无视频时才做边界钳制
window.addEventListener('resize', debounce(()=>{
    const ball = document.querySelector('#hhkan-float-ball');
    if(!ball) return;
    const vRect = getVideoBounds();
    if(vRect && vRect.width > 0 && vRect.height > 0){
        // 视频框存在：始终重新对齐左上角，实现放大/缩小自适应
        _alignFloatBallToVideoTopRight(ball, vRect);
        _lastVideoRectKey = `${Math.round(vRect.left)},${Math.round(vRect.top)},${Math.round(vRect.width)},${Math.round(vRect.height)}`;
    }else{
        // 无视频：仅做视口边界钳制，保留用户拖动位置
        const rect = ball.getBoundingClientRect();
        const maxLeft = window.innerWidth - 30;
        const maxTop = window.innerHeight - 30;
        let newLeft = rect.left;
        let newTop = rect.top;
        let changed = false;
        if(rect.left > maxLeft){ newLeft = maxLeft; changed = true; }
        if(rect.top > maxTop){ newTop = maxTop; changed = true; }
        if(rect.left < -30){ newLeft = 0; changed = true; }
        if(rect.top < BAR_HEIGHT - 10){ newTop = BAR_HEIGHT; changed = true; }
        if(changed){
            ball.style.left = newLeft + 'px';
            ball.style.top = newTop + 'px';
            saveFloatBallPos({ left: newLeft, top: newTop, side: newLeft > window.innerWidth*0.5 ? 'right':'left' });
        }
    }
}, 150));
// ========== 初始化 ==========
ensureFloatBall();
buildUI();
startWatch();
bindFullscreenEvents();
// 页面加载后检测是否需要自动全屏（选集跳转/线路切换后触发）
if(sessionStorage.getItem(AUTO_FS_KEY) === "1"){
    tryAutoFullscreen();
}
document.addEventListener("fullscreenchange",()=>{
    fixAllFixedElements();
})
// 首次免责弹窗
if(sessionStorage.getItem("pake_session_ok") !== "yes"){
    if(!document.querySelector("#pake-disclaimer-mask")){
        const maskDom = document.createElement('div');
        maskDom.id = "pake-disclaimer-mask";
        maskDom.innerHTML = `
            <div id="pake-disclaimer-box">
                <h3>使用声明</h3>
                <p>打包仅限个人使用，请勿传播或商业用途，否则后果自负。</p>
                <button id="pake-btn-confirm">我已知晓</button>
            </div>
        `;
        document.body.appendChild(maskDom);
        maskDom.querySelector('#pake-disclaimer-box').addEventListener('click',e=>e.stopPropagation());
        document.querySelector('#pake-btn-confirm').addEventListener('click',(e)=>{
            e.stopPropagation();
            sessionStorage.setItem("pake_session_ok","yes");
            maskDom.remove();
        });
    }
}
// 监听视频框自身尺寸/位置变化（播放器放大、缩小、布局调整时自动重新对齐到左上角）
(function observeVideoResize(){
    let _ro = null;
    function attachRO(videoEl){
        if(!videoEl || _ro) return;
        _ro = new ResizeObserver(debounce(()=>{
            const ball = document.querySelector('#hhkan-float-ball');
            if(!ball) return;
            const vRect = getVideoBounds();
            if(vRect && vRect.width > 0 && vRect.height > 0){
                _alignFloatBallToVideoTopRight(ball, vRect);
                _lastVideoRectKey = `${Math.round(vRect.left)},${Math.round(vRect.top)},${Math.round(vRect.width)},${Math.round(vRect.height)}`;
            }
        }, 120));
        _ro.observe(videoEl);
    }
    // 初始尝试绑定
    const v = document.querySelector('video');
    if(v) attachRO(v);
    // 视频元素动态出现时绑定
    const mo = new MutationObserver(debounce(()=>{
        if(!_ro){
            const v2 = document.querySelector('video');
            if(v2) attachRO(v2);
        }
    }, 200));
    mo.observe(document.body, {childList:true, subtree:true});
})();
// 监听全屏元素内部的变化
const fsObserver = new MutationObserver((mutations)=>{
    mutations.forEach(mutation => {
        if(mutation.type === 'childList' && mutation.removedNodes){
            mutation.removedNodes.forEach(node => {
                if(node.id === 'hhkan-float-ball'){
                    console.log('[悬浮球] 检测到被移除，正在重建...');
                    globalPanelVisible = false;
                    createFloatBall();
                }
            });
        }
    });
});
fsObserver.observe(document.body, {childList:true, subtree:false});
// 定期检查视频元素
setInterval(()=>{
    updateFloatBallVisibility();
}, 2000);
// 延迟初始化
setTimeout(()=>{
    if(!document.querySelector("#hhkan-float-ball")){
        ensureFloatBall();
    }
    if(!document.querySelector("#pake-window-top-bar")){
        const evt = new Event('DOMContentLoaded');
        document.dispatchEvent(evt);
    }
},1500);
});