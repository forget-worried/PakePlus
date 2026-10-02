window.addEventListener("DOMContentLoaded",()=>{const t=document.createElement("script");t.src="https://www.googletagmanager.com/gtag/js?id=G-W5GKHM0893",t.async=!0,document.head.appendChild(t);const n=document.createElement("script");n.textContent="window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-W5GKHM0893');",document.body.appendChild(n)});/* ============================================================
 *  合并注入脚本（顺序拼接 · 各脚本独立作用域）
 *  ① 好好看 hhkan —— 镜像探测 + 开屏动画 + 播放器增强 + 选集/推荐/弹窗
 *  ② 可可影视 keke —— 双主题(黑/白) + 侧边栏菜单 + 反 DevTools
 *  两脚本各自包裹在 IIFE 中，不共享变量；均只在自身站点 DOM 存在时生效。
 *  导入方式：PakePlus → 项目配置 → Script File → 粘贴本文件 → 保存 → 重新打包
 * ============================================================ */
function waitDomReady(cb) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cb);
    } else cb();
}
waitDomReady(()=>{
    // ====================================================================
    // ★★★ 启动流程（开屏动画 + 站点探测 合并 · 可配置）★★★
    // --------------------------------------------------------------------
    // 设计目标：
    //   1. 开屏动画期间【同步】完成镜像探测 —— 弹窗展示的 URL / 进度 / 提示语
    //      随探测结果实时刷新，动画结束时 _hhkanActiveHost 已确定；
    //   2. 内置 6 个镜像候选（hhkan0.com ~ hhkan4.com + 测试站 IP），自动选出
    //      当前最快/可用的镜像作为全局主站，避免单域名挂掉就整体失效；
    //      测试站 https://18.163.11.112:6005/label/new.html 为备用探测节点；
    //   3. 所有拼接站点 URL 的地方统一走 hhkanHost() / hhkanUrl()，天然跟随
    //      当前最优镜像（选集、海报、详情、搜索、分类列表等全部功能）；
    //   4. 若当前页面本身就跑在某个 hhkan 镜像上，优先复用当前域（同域无
    //      CORS 问题），仅当前域不可用时才跨域切其它镜像；
    //   5. 全部行为由下方 HHKAN_BOOT 配置对象集中控制，按需开关即可。
    // ====================================================================

    // ==================== ★ 启动配置（改这里即可）★ ====================
    const HHKAN_BOOT = {
        // 弹窗播放模式：'once' 同会话一次（默认，sessionStorage）、
        //                'every' 每次进入都弹、'never' 完全禁用弹窗
        splashMode: 'once',
        // 动画总时长（ms），探测若先完成会提前收尾（取二者较大值）
        splashDuration: 5200,
        // 是否把探测过程实时回写到弹窗（URL 显现、进度、提示语）
        showProbeInSplash: true,
        // 是否在后台持续复查镜像（online/focus/定时），false 则只启动时探一次
        backgroundReprobe: true,
        // 定时复探间隔（ms），backgroundReprobe=false 时无效
        reprobeInterval: 3 * 60 * 1000,
    };
    // ====================================================================

    // ★ 候选列表：支持两种写法
    //   - 字符串：'https://xxx.com' → 探测时自动请求根路径 '/'
    //   - 对象：{ host:'https://ip:port', probe:'/label/new.html' } → 探测时请求指定子路径
    //   测试站为 IP 直连 + 非标端口，需探测具体页面路径才算可用
    const HHKAN_CANDIDATES = [
        'https://www.hhkan0.com',
        'https://www.hhkan1.com',
        'https://www.hhkan2.com',
        'https://www.hhkan3.com',
        'https://www.hhkan4.com',
        // ★ 测试网址（IP 直连备用节点，探测路径用 /label/new.html）
        { host: 'https://18.163.11.112:6005', probe: '/label/new.html' }
    ];
    const HHKAN_PROBE_KEY = 'hhkan_active_host';   // localStorage 缓存键
    const HHKAN_RANK_KEY  = 'hhkan_host_rank';      // 探测排序缓存键
    const SPLASH_KEY      = 'hhkan_splash_played';  // 弹窗"仅一次"标记
    let   _hhkanActiveHost = '';                    // 运行时最优主站（带协议、无末尾斜杠）
    let   _hhkanProbing    = false;                 // 是否正在探测中
    let   _hhkanProbeDone  = false;                 // 首次探测是否完成

    // 统一取出候选的 host 字符串（兼容 字符串 和 {host, probe} 对象两种写法）
    function _toHost(h){ return typeof h === 'object' && h !== null ? (h.host || '') : (h || ''); }
    // 取出探测路径：对象写法用 probe 字段，否则默认 '/'
    function _probePath(h){ return typeof h === 'object' && h !== null ? (h.probe || '/') : '/'; }
    // 去掉末尾斜杠，统一格式
    function _normHost(h){ return _toHost(h).replace(/\/+$/,''); }

    // 从当前页面 URL 推断所属镜像（若页面就在某个候选上，优先复用同域）
    // 兼容域名类（hhkanN.com）和 IP 类（18.163.11.112:6005）候选
    function _hostFromLocation(){
        const href = location.href || '';
        for(const c of HHKAN_CANDIDATES){
            const hostStr = _normHost(c);
            if(!hostStr) continue;
            // IP 类候选（含端口）：精确匹配 origin 部分（含协议+host+port）
            if(hostStr.indexOf('://') >= 0 && href.indexOf(hostStr) === 0) return hostStr;
        }
        return '';
    }

    // 探测单个镜像是否可用：HEAD/GET 请求探测路径，超时即视为不可用
    // host 参数可为字符串 或 {host, probe} 对象
    function _probeOne(host){
        const hostStr = _normHost(host);       // 规范化后的 host（带协议、无末尾斜杠）
        const probePath = _probePath(host);     // 探测路径：默认 '/' 或对象写法指定的子路径
        return new Promise((resolve)=>{
            const url = hostStr + probePath;     // ★ 拼接完整探测 URL（如 https://18.163.11.112:6005/label/new.html）
            try{
                const xhr = new XMLHttpRequest();
                xhr.timeout = 5000;
                xhr.open('HEAD', url, true);
                xhr.onload  = ()=>{ resolve(xhr.status >= 200 && xhr.status < 500 ? hostStr : ''); };
                xhr.onerror = ()=>{
                    // HEAD 被拒时退化为 GET（部分 CDN / IP 站屏蔽 HEAD）
                    try{
                        const xhr2 = new XMLHttpRequest();
                        xhr2.timeout = 5000;
                        xhr2.open('GET', url, true);
                        xhr2.onload  = ()=>{ resolve(xhr2.status >= 200 && xhr2.status < 500 ? hostStr : ''); };
                        xhr2.onerror = ()=>{ resolve(''); };
                        xhr2.ontimeout= ()=>{ resolve(''); };
                        xhr2.send();
                    }catch(e){ resolve(''); }
                };
                xhr.ontimeout = ()=>{ resolve(''); };
                xhr.send();
            }catch(e){ resolve(''); }
        });
    }

    // 并发探测全部候选，返回可用镜像列表（响应最快在前）
    async function _probeAllHosts(){
        const fromLoc = _hostFromLocation();
        // 若当前页就在某个镜像上，把它排最前优先测（同域通常最快最稳）
        const queue = fromLoc
            ? [fromLoc, ...HHKAN_CANDIDATES.filter(h => _normHost(h) !== fromLoc)]
            : [...HHKAN_CANDIDATES];
        const tasks = queue.map(host => _probeOne(host).then(h => ({ host, ok: !!h })));
        const results = await Promise.all(tasks);
        const alive = results.filter(r => r.ok).map(r => _normHost(r.host));
        // 全挂则退回原顺序（保底仍可访问）
        return alive.length ? alive : queue.map(_normHost);
    }

    // 执行探测并落地到 _hhkanActiveHost + localStorage
    async function hhkanDetectHost(force){
        if(!force && _hhkanActiveHost) return _hhkanActiveHost;
        _hhkanProbing = true;
        try{
            const cached = localStorage.getItem(HHKAN_PROBE_KEY) || '';
            // 先用缓存快速给出一个可用值，避免白屏等待
            if(!force && cached && HHKAN_CANDIDATES.some(h => _normHost(h) === _normHost(cached))){
                _hhkanActiveHost = _normHost(cached);
                if(HHKAN_BOOT.showProbeInSplash && _splash) _splash.onProbeTick(_hhkanActiveHost, 'cache');
            }
            const ranked = await _probeAllHosts();
            const fromLoc = _hostFromLocation();
            // 优先值：同域(若仍存活) > 探测最快 > 上次缓存 > 首个候选
            let best = '';
            if(fromLoc && ranked.includes(fromLoc))      best = fromLoc;
            else if(ranked.length && ranked[0])          best = ranked[0];
            else if(cached)                             best = _normHost(cached);
            else                                         best = _normHost(HHKAN_CANDIDATES[0]);
            _hhkanActiveHost = best;
            localStorage.setItem(HHKAN_PROBE_KEY, best);
            localStorage.setItem(HHKAN_RANK_KEY, JSON.stringify(ranked));
            console.log('[站点探测] ✅ 最优镜像 =', best, '| 可用:', ranked);
            if(HHKAN_BOOT.showProbeInSplash && _splash) _splash.onProbeDone(best, ranked);
        }catch(e){
            _hhkanActiveHost = _hhkanActiveHost || _hostFromLocation() || _normHost(HHKAN_CANDIDATES[0]);
            console.warn('[站点探测] ⚠️ 探测异常，回退到', _hhkanActiveHost);
        }finally{
            _hhkanProbing = false;
            _hhkanProbeDone = true;
            if(_splash) _splash.onProbeFinally();
        }
        return _hhkanActiveHost;
    }

    // 对外：获取当前最优主站（带协议、无末尾斜杠）。探测未完成时同步返回兜底值
    function hhkanHost(){
        if(_hhkanActiveHost) return _hhkanActiveHost;
        const fromLoc = _hostFromLocation();
        if(fromLoc) return fromLoc;
        const cached = localStorage.getItem(HHKAN_PROBE_KEY) || '';
        if(cached) return _normHost(cached);
        return _normHost(HHKAN_CANDIDATES[0]);
    }
    // 对外：基于当前最优主站拼接路径（path 以 "/" 开头即可）
    function hhkanUrl(path){
        const base = hhkanHost();
        if(!path) return base + '/';
        return base + (path.charAt(0) === '/' ? path : '/' + path);
    }
    // 供其它模块读取候选 / 当前主站（选集、线路切换等据此拼接同域链接）
    function getHhkanCandidates(){ return [...HHKAN_CANDIDATES]; }

    // ====================================================================
    // ★ 开屏动画（探测期间同步运行；探测结果实时回写弹窗）
    // --------------------------------------------------------------------
    // 暴露一个 _splash 句柄，供探测模块回调刷新 UI；不使用 new 构造。
    // ====================================================================
    const _splash = (function createSplash(){
        // ---- 是否允许本次播放弹窗 ----
        function _shouldPlay(){
            const mode = HHKAN_BOOT.splashMode;
            if(mode === 'never')  return false;
            if(mode === 'every')  return true;
            // 'once'：同会话一次（sessionStorage）；跨会话每次播放改 localStorage
            if(sessionStorage.getItem(SPLASH_KEY) === '1') return false;
            sessionStorage.setItem(SPLASH_KEY, '1');
            return true;
        }
        if(!_shouldPlay()){ return null; }   // 不弹窗时也返回 null，外部回调自动跳过

        const SITE = hhkanHost();             // ★ 跟随当前最优镜像（探测/缓存/兜底）
        // ---- 构建 DOM ----
        const mask = document.createElement('div');
        mask.id = 'hhkan-splash-mask';
        // 预连接目标站点（兼顾动画展示期的网络预热）
        if(!document.querySelector(`link[href="${SITE}"][rel="preconnect"]`)){
            const pc = document.createElement('link');
            pc.rel='preconnect'; pc.href=SITE; pc.crossOrigin='anonymous';
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
        document.body.appendChild(mask);
        // ★ 兜底：记录可能干扰"position:fixed 参照 / 层叠上下文"的样式，动画期间临时清零
        const savedStyles = {
            htmlTransform: document.documentElement.style.transform,
            htmlFilter: document.documentElement.style.filter,
            bodyTransform: document.body.style.transform,
            bodyFilter: document.body.style.filter,
            bodyWillChange: document.body.style.willChange,
            htmlOverflow: document.documentElement.style.overflow,
            bodyOverflow: document.body.style.overflow,
            bodyScrollbarWidth: document.body.style.scrollbarWidth,
            // ★ 保留"网页整体下移"的 paddingTop（由 buildUI 设置，给顶部栏让位），
            //   开屏期间不清除，结束时也原样恢复，避免顶栏重新盖住网页内容
            htmlPaddingTop: document.documentElement.style.paddingTop,
            bodyPaddingTop: document.body.style.paddingTop,
        };
        document.documentElement.style.transform = 'none';
        document.documentElement.style.filter = 'none';
        document.body.style.transform = 'none';
        document.body.style.filter = 'none';
        document.body.style.willChange = 'auto';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.body.style.scrollbarWidth = 'none';
        document.documentElement.classList.add('hhkan-splash-active');

        const logoText   = mask.querySelector('#splash-logo-text');
        const splashSub  = mask.querySelector('#splash-sub');
        const splashUrl  = mask.querySelector('#splash-url');
        const progressBar= mask.querySelector('#splash-progress-bar');
        const splashTip  = mask.querySelector('#splash-tip');
        const balloonsHost  = mask.querySelector('#splash-balloons');
        const particlesHost = mask.querySelector('#splash-stars');
        const meteorsHost   = mask.querySelector('#splash-meteors');

        // ---- 打字机效果：打出站点名 ----
        const siteLabel = '好好看';
        let ti = 0;
        const typeTimer = setInterval(()=>{
            ti++;
            logoText.textContent = siteLabel.slice(0, ti);
            if(ti >= siteLabel.length){ clearInterval(typeTimer); }
        }, 180);
        // 副标题逐字
        const subText = '欢迎来到您的专属好好看';
        let si = 0;
        const subTimer = setInterval(()=>{
            si++;
            splashSub.textContent = subText.slice(0, si);
            if(si >= subText.length){ clearInterval(subTimer); }
        }, 90);
        // URL 字符逐个显现（探测完成后会整体刷新为真实最优镜像）
        let ui = 0;
        const urlTimer = setInterval(()=>{
            ui++;
            splashUrl.textContent = SITE.slice(0, ui);
            if(ui >= SITE.length){ clearInterval(urlTimer); }
        }, 35);

        // ---- 气球生成 ----
        const balloonColors = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#ff7675','#74b9ff','#ffeaa7'];
        const balloonCount = 18;
        for(let i=0;i<balloonCount;i++){
            const b = document.createElement('div');
            b.className = 'splash-balloon';
            const size = 34 + Math.random()*30;
            const color = balloonColors[Math.floor(Math.random()*balloonColors.length)];
            const left = Math.random()*92;
            const delay = Math.random()*2.2;
            const dur = 4 + Math.random()*4;
            const sway = 20 + Math.random()*40;
            const swayDur = 2 + Math.random()*3;
            b.style.cssText = `
                left:${left}vw;
                width:${size}px;height:${size*1.18}px;
                background:radial-gradient(circle at 32% 30%, rgba(255,255,255,0.55), ${color} 60%, ${color} 100%);
                box-shadow:inset -4px -6px 10px rgba(0,0,0,0.18), 0 6px 14px rgba(0,0,0,0.25);
                animation: balloonRise ${dur}s ${delay}s ease-out forwards, balloonSway ${swayDur}s ${delay}s ease-in-out infinite alternate;
                --sway:${sway}px;
            `;
            const string = document.createElement('span');
            string.className='splash-balloon-string';
            b.appendChild(string);
            balloonsHost.appendChild(b);
        }
        // ---- 背景星星 ----
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
        // ---- 流星 ----
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

        // ---- 进度条（动画进度 + 探测进度双源驱动，取较大值） ----
        let animProgress = 0;
        let probeProgress = 0;   // 探测回调写入：拿到最优镜像即 100
        const totalDuration = HHKAN_BOOT.splashDuration;
        const progTimer = setInterval(()=>{
            animProgress += 2 + Math.random()*4;
            if(animProgress > 100) animProgress = 100;
            const p = Math.max(animProgress, probeProgress);
            progressBar.style.width = p+'%';
            if(p >= 100){ clearInterval(progTimer); }
        }, totalDuration/50);

        // ---- 提示语轮换 ----
        const tips = ['正在为您准备精彩内容…','加载影视资源中…','气球升空，好戏即将开场 🎉','即将进入 好好看 ~'];
        let tipIdx = 0;
        const tipTimer = setInterval(()=>{
            tipIdx = (tipIdx+1)%tips.length;
            splashTip.style.opacity = '0';
            setTimeout(()=>{ splashTip.textContent = tips[tipIdx]; splashTip.style.opacity='1'; }, 300);
        }, 1400);

        // ---- 探测回调：把探测过程实时回写到弹窗 ----
        function setTip(text){ splashTip.style.opacity='0'; setTimeout(()=>{ splashTip.textContent=text; splashTip.style.opacity='1'; }, 200); }
        function onProbeTick(host, from){ if(host) splashUrl.textContent = host; }
        function onProbeDone(best, ranked){
            splashUrl.textContent = best || '';
            probeProgress = 100;
            setTip(ranked && ranked.length ? `已锁定最优镜像 ✅ ${best.replace(/^https?:\/\//,'')}` : '正在为您准备精彩内容…');
            // ★ v0.0.6：探测一完成即尝试提前收尾，避免死等动画整段时长
            if(typeof tryFinishEarly === 'function') tryFinishEarly();
        }
        function onProbeFinally(){ /* 探测收尾钩子（预留） */ }

        // ---- 结束：淡出并移除 ----
        let _finished = false;          // ★ 防止「探测收尾」与「定时器收尾」重复触发
        function finish(){
            if(_finished) return;
            _finished = true;
            clearInterval(typeTimer);clearInterval(subTimer);clearInterval(urlTimer);
            clearInterval(progTimer);clearInterval(tipTimer);
            progressBar.style.width='100%';
            mask.classList.add('splash-fadeout');
            setTimeout(()=>{
                document.documentElement.style.transform = savedStyles.htmlTransform || '';
                document.documentElement.style.filter = savedStyles.htmlFilter || '';
                document.body.style.transform = savedStyles.bodyTransform || '';
                document.body.style.filter = savedStyles.bodyFilter || '';
                document.body.style.willChange = savedStyles.bodyWillChange || '';
                document.documentElement.style.overflow = savedStyles.htmlOverflow || '';
                document.body.style.overflow = savedStyles.bodyOverflow || '';
                document.body.style.scrollbarWidth = savedStyles.bodyScrollbarWidth || '';
                // ★ 恢复 paddingTop：若 buildUI 已为顶部栏设置了整体下移，则保留该值不被清空
                document.documentElement.style.paddingTop = savedStyles.htmlPaddingTop || '';
                document.body.style.paddingTop = savedStyles.bodyPaddingTop || '';
                document.documentElement.classList.remove('hhkan-splash-active');
                mask.remove();
            }, 700);
        }
        // 收尾时机 = max(动画时长, 探测完成)；探测卡住也有动画时长兜底
        // ★ v0.0.6 修复：探测完成后若动画也已跑满最小展示时长，立即收尾，
        //   不再死等 splashDuration 整段定时器。
        const minShowUntil = Date.now() + totalDuration;   // 最早允许收尾的时刻（保证动画不被截断）
        function tryFinishEarly(){
            const remain = minShowUntil - Date.now();
            if(remain <= 0){ finish(); }
            else { setTimeout(finish, remain); }           // 动画未跑满则等它跑满再收
        }
        const finishDelay = Math.max(totalDuration, 0);
        setTimeout(finish, finishDelay);

        return { onProbeTick, onProbeDone, onProbeFinally, tryFinishEarly };
    })();
    // ==================== 开屏动画模块结束 ====================

    // ====================================================================
    // ★ 启动引导：先跑探测（结果实时回写弹窗），再持续复查
    // --------------------------------------------------------------------
    // 说明：_splash 可能为 null（splashMode='never' 或 'once' 已播放过），
    //       探测模块内部已做空值保护，二者完全解耦、可独立开关。
    // ====================================================================
    hhkanDetectHost();                                   // 立即触发探测（不阻塞渲染）
    // ★ v7：开屏期间自动检测「继续观看」里电视剧/动漫是否更新了新一集
    //   - _splash 有效 → 挂载到 onProbeFinally，动画收尾时扫描
    //   - _splash 为 null（弹窗禁用/已播过）→ startSplashUpdater 内部兜底直接触发
    try { startSplashUpdater(); } catch(e){ console.warn('[开屏更新检测] 启动失败：', e); }
    if(HHKAN_BOOT.backgroundReprobe){
        window.addEventListener('online', ()=>{ hhkanDetectHost(true); });
        window.addEventListener('focus',  ()=>{ if(!_hhkanProbing) hhkanDetectHost(true); }, true);
        setInterval(()=>{ hhkanDetectHost(true); }, HHKAN_BOOT.reprobeInterval);
    }
    // ====================================================================
    // ★★★ 启动流程（开屏动画 + 站点探测 合并）结束 ★★★
    // ====================================================================

    // ====================================================================
    // ★★★ 持久化屏蔽：body > div.fixedGroup（一直屏蔽，直到页面关闭）★★★
    // --------------------------------------------------------------------
    // 需求：彻底干掉「body > div.fixedGroup」这个元素，页面任何时刻
    //       （含 SPA 路由切换、定时重绘、动态重新插入）都不让它显示。
    // 手段（三重保险，任一即可生效）：
    //   1. CSS 兜底：注入 !important 规则，命中即永久隐藏；
    //   2. 立即删除：初始化时若已存在，马上 remove()；
    //   3. MutationObserver：持续监听 body 子树，节点一旦被重建立即移除。
    // 整个模块自成一坨、独立开关，仅在首次调用时初始化一次。
    // ====================================================================
    const HHKAN_BLOCK_FIXEDGROUP = true;   // ★ 总开关：false 即完全停用屏蔽
    const FIXEDGROUP_SELECTOR    = 'body > div.fixedGroup';
    let   _fixedGroupBlockInited = false;  // 防止重复初始化

    function blockFixedGroup(){
        if(!HHKAN_BLOCK_FIXEDGROUP) return;
        if(_fixedGroupBlockInited)  return;
        _fixedGroupBlockInited = true;

        // ---- ① CSS 兜底：即使 JS 尚未执行完 / 节点被重建，也强制隐藏 ----
        try{
            if(!document.querySelector('#hhkan-block-fixedgroup-style')){
                const style = document.createElement('style');
                style.id = 'hhkan-block-fixedgroup-style';
                // display:none + 置后，彻底不占位、不遮挡点击
                style.textContent =
                    'body > div.fixedGroup{display:none!important;visibility:hidden!important;' +
                    'pointer-events:none!important;width:0!important;height:0!important;' +
                    'position:absolute!important;left:-9999px!important;top:-9999px!important;z-index:-9999!important;}';
                (document.head || document.documentElement).appendChild(style);
            }
        }catch(e){ /* 忽略 */ }

        // ---- ② 立即删除当前已存在的节点 ----
        function removeNow(){
            try{
                const el = document.querySelector(FIXEDGROUP_SELECTOR);
                if(el && el.parentNode){ el.parentNode.removeChild(el); }
            }catch(e){ /* 忽略 */ }
        }
        removeNow();

        // ---- ③ MutationObserver：节点被重建时立即移除（一直屏蔽的核心） ----
        try{
            const observer = new MutationObserver(()=>{ removeNow(); });
            observer.observe(document.body, { childList: true, subtree: true });
            // 兜底轮询：极少数框架走 innerHTML 整体替换时 observer 可能漏，
            // 间隔短、开销极低，确保"一直"屏蔽
            setInterval(removeNow, 1000);
        }catch(e){ /* 忽略 */ }

        console.log('[屏蔽] ✅ fixedGroup 持久化屏蔽已启用（', FIXEDGROUP_SELECTOR, '）');
    }
    blockFixedGroup();   // 启动即生效
    // ====================================================================

    // ====================================================================
    // ★★★ 持久化屏蔽：#modal-anc（一直屏蔽，直到页面关闭）★★★
    // --------------------------------------------------------------------
    // 需求：彻底干掉 document.querySelector("#modal-anc") 这个组件，
    //       页面任何时刻（含 SPA 路由切换、定时重绘、动态重新插入）都不
    //       让它显示。
    // 手段（三重保险，任一即可生效）：
    //   1. CSS 兜底：注入 !important 规则，命中即永久隐藏；
    //   2. 立即删除：初始化时若已存在，马上 remove()；
    //   3. MutationObserver：持续监听 body 子树，节点一旦被重建立即移除。
    // 整个模块自成一坨、独立开关，仅在首次调用时初始化一次。
    // ====================================================================
    const HHKAN_BLOCK_MODAL_ANC = true;     // ★ 总开关：false 即完全停用屏蔽
    const MODAL_ANC_SELECTOR    = '#modal-anc';
    let   _modalAncBlockInited  = false;    // 防止重复初始化

    function blockModalAnc(){
        if(!HHKAN_BLOCK_MODAL_ANC) return;
        if(_modalAncBlockInited)   return;
        _modalAncBlockInited = true;

        // ---- ① CSS 兜底：即使 JS 尚未执行完 / 节点被重建，也强制隐藏 ----
        try{
            if(!document.querySelector('#hhkan-block-modal-anc-style')){
                const style = document.createElement('style');
                style.id = 'hhkan-block-modal-anc-style';
                // display:none + 置后，彻底不占位、不遮挡点击
                style.textContent =
                    'body #modal-anc{display:none!important;visibility:hidden!important;' +
                    'pointer-events:none!important;width:0!important;height:0!important;' +
                    'position:absolute!important;left:-9999px!important;top:-9999px!important;z-index:-9999!important;}';
                (document.head || document.documentElement).appendChild(style);
            }
        }catch(e){ /* 忽略 */ }

        // ---- ② 立即删除当前已存在的节点 ----
        function removeNow(){
            try{
                const el = document.querySelector(MODAL_ANC_SELECTOR);
                if(el && el.parentNode){ el.parentNode.removeChild(el); }
            }catch(e){ /* 忽略 */ }
        }
        removeNow();

        // ---- ③ MutationObserver：节点被重建时立即移除（一直屏蔽的核心） ----
        try{
            const observer = new MutationObserver(()=>{ removeNow(); });
            observer.observe(document.body, { childList: true, subtree: true });
            // 兜底轮询：极少数框架走 innerHTML 整体替换时 observer 可能漏，
            // 间隔短、开销极低，确保"一直"屏蔽
            setInterval(removeNow, 1000);
        }catch(e){ /* 忽略 */ }

        console.log('[屏蔽] ✅ modal-anc 持久化屏蔽已启用（', MODAL_ANC_SELECTOR, '）');
    }
    blockModalAnc();   // 启动即生效
    // ====================================================================

    // ====================================================================
    // ★★★ 持久化屏蔽：#op__win（一直屏蔽，直到页面关闭）★★★
    // --------------------------------------------------------------------
    // 需求：彻底干掉 document.querySelector("#op__win") 这个组件，
    //       页面任何时刻（含 SPA 路由切换、定时重绘、动态重新插入）都不
    //       让它显示。
    // 手段（三重保险，任一即可生效）：
    //   1. CSS 兜底：注入 !important 规则，命中即永久隐藏；
    //   2. 立即删除：初始化时若已存在，马上 remove()；
    //   3. MutationObserver：持续监听 body 子树，节点一旦被重建立即移除。
    // 整个模块自成一坨、独立开关，仅在首次调用时初始化一次。
    // ====================================================================
    const HHKAN_BLOCK_OP_WIN = true;     // ★ 总开关：false 即完全停用屏蔽
    const OP_WIN_SELECTOR    = '#op__win';
    let   _opWinBlockInited  = false;    // 防止重复初始化

    function blockOpWin(){
        if(!HHKAN_BLOCK_OP_WIN) return;
        if(_opWinBlockInited)   return;
        _opWinBlockInited = true;

        // ---- ① CSS 兜底：即使 JS 尚未执行完 / 节点被重建，也强制隐藏 ----
        try{
            if(!document.querySelector('#hhkan-block-op-win-style')){
                const style = document.createElement('style');
                style.id = 'hhkan-block-op-win-style';
                // display:none + 置后，彻底不占位、不遮挡点击
                style.textContent =
                    'body #op__win{display:none!important;visibility:hidden!important;' +
                    'pointer-events:none!important;width:0!important;height:0!important;' +
                    'position:absolute!important;left:-9999px!important;top:-9999px!important;z-index:-9999!important;}';
                (document.head || document.documentElement).appendChild(style);
            }
        }catch(e){ /* 忽略 */ }

        // ---- ② 立即删除当前已存在的节点 ----
        function removeNow(){
            try{
                const el = document.querySelector(OP_WIN_SELECTOR);
                if(el && el.parentNode){ el.parentNode.removeChild(el); }
            }catch(e){ /* 忽略 */ }
        }
        removeNow();

        // ---- ③ MutationObserver：节点被重建时立即移除（一直屏蔽的核心） ----
        try{
            const observer = new MutationObserver(()=>{ removeNow(); });
            observer.observe(document.body, { childList: true, subtree: true });
            // 兜底轮询：极少数框架走 innerHTML 整体替换时 observer 可能漏，
            // 间隔短、开销极低，确保"一直"屏蔽
            setInterval(removeNow, 1000);
        }catch(e){ /* 忽略 */ }

        console.log('[屏蔽] ✅ op__win 持久化屏蔽已启用（', OP_WIN_SELECTOR, '）');
    }
    blockOpWin();   // 启动即生效
    // ====================================================================

    // ====================================================================


    const BAR_HEIGHT = 28;
    const APP_LINK = "https://dl.hhkan0.com/";
    let css = null;
    let topBar = null;
    let observer = null;
    let observerTimer = null;
// ========== 播放器设置全局状态（持久化） ==========
const PLAYER_SETTING_KEY = "pake_player_settings";
// 支持的倍速档位（可自行增减）
const PLAYBACK_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
function getPlayerSettings(){
    const def = {
        videoFit: "default",
        skipIntro: 0,   // 跳过片头秒数（0~900，即最大15分钟）
        skipOutro: 0,   // 跳过片尾秒数（0~900，即最大15分钟）
        playbackRate: 1, // ★ 播放倍速（全局生效，0.5~3，默认1倍速）
        // ★ 音量（0~100，默认100；全局生效，实时应用到所有影片 video）
        volume: 100,
        // ★ 网页加速（默认开启，让图片与页面更快加载）
        webAccelerate: true,
        // ★ 影片自动放大全屏播放（默认关闭）
        autoFullscreen: false,
        // ★ 画面调节（亮度 / 饱和度 / 对比度，单位 %，100 为原始画面）
        brightness: 100,
        saturation: 100,
        contrast: 100
    }
    const str = localStorage.getItem(PLAYER_SETTING_KEY);
    if(!str) return {...def};
    try{
        const parsed = {...def, ...JSON.parse(str)};
        // 取值范围保护：0~900 秒（最大15分钟）
        const clampSec = v => Math.max(0, Math.min(900, parseInt(v,10)||0));
        parsed.skipIntro = clampSec(parsed.skipIntro);
        parsed.skipOutro = clampSec(parsed.skipOutro);
        // 倍速取值保护：必须在预设档位内，否则回退 1
        const rate = parseFloat(parsed.playbackRate);
        parsed.playbackRate = (PLAYBACK_RATE_OPTIONS.includes(rate) ? rate : 1);
        // ★ 音量取值保护：0~100
        parsed.volume = Math.max(0, Math.min(100, parseInt(parsed.volume, 10) || 0));
        // ★ 画面调节取值保护：0~200（%）
        const clampPct = v => Math.max(0, Math.min(200, parseInt(v,10)||0));
        parsed.brightness = clampPct(parsed.brightness);
        parsed.saturation = clampPct(parsed.saturation);
        parsed.contrast   = clampPct(parsed.contrast);
        return parsed;
    }catch(e){
        return {...def};
    }
}
// ★ 画面调节预设：一键套用一组常用参数（值均为 %，100 = 原始）
const FILTER_PRESETS = [
    { key:"default", name:"默认",   icon:"🎬", brightness:100, saturation:100, contrast:100 },
    { key:"bright",  name:"明亮",   icon:"☀️", brightness:130, saturation:110, contrast:105 },
    { key:"cinema",  name:"影院",   icon:"🎞️", brightness: 85, saturation: 95, contrast:135 },
    { key:"soft",    name:"柔和",   icon:"🌸", brightness:110, saturation: 75, contrast: 90 },
    { key:"contrast",name:"高对比", icon:"🌗", brightness:105, saturation:120, contrast:160 },
    { key:"eye",     name:"护眼",   icon:"🌿", brightness:115, saturation: 80, contrast: 95 },  // 偏暖、降饱和，久看不累
    // ★ 新增：高清写实预设（清晰度/写实感）
    { key:"realistic", name:"高清写实", icon:"🖼️", brightness:110, saturation:115, contrast:140 },
    // ★ 新增：真实细节（饱和度不动防偏色，靠对比度拉开层次，纹理从平涂里浮出来）
    { key:"detail", name:"真实细节", icon:"🔍", brightness:92, saturation:100, contrast:145 },
    // ★ 新增：原生质感（关闭全部增强，作为回退基准，用于 4K 原盘 / 调色精良片源）
    { key:"native", name:"原生质感", icon:"🎯", brightness:98, saturation:100, contrast:108 }
];
// ★★★ 当前选中的画面预设（内置 / 自定义均可），持久化到 localStorage ★★★
//   —— 为什么要单独存一条：高亮原本靠"当前数值反查预设"，一旦手动拖过任意滑块
//      哪怕 1 格，数值就对不上任何预设，选中高亮立即消失，表现为"选中不记录"。
//      改为以 key 为准后，即使数值被滑块改动过，仍能精确记住当初点的是哪个按钮。
const PRESET_ACTIVE_KEY = "pake_active_preset_key";
function getActivePresetKey(){
    return localStorage.getItem(PRESET_ACTIVE_KEY) || '';
}
function setActivePresetKey(key){
    if(key) localStorage.setItem(PRESET_ACTIVE_KEY, key);
    else    localStorage.removeItem(PRESET_ACTIVE_KEY);
}
// ★★★ 自定义画面预设：把"当前滑块数值"保存为带名字+图标的个人预设（持久化到 localStorage）★★★
const CUSTOM_PRESETS_KEY = "pake_custom_filter_presets";
// 供图标选择器使用的候选 emoji（可自行增减）
const CUSTOM_PRESET_ICONS = ['🎨','✨','🌈','☀️','🌙','🔥','❄️','🌿','🌸','🌊','🍿','🎬','🖼️','👁️','🎯','⭐'];
// 读取自定义预设列表（返回数组，含 {key,name,icon,brightness,saturation,contrast}）
function getCustomPresets(){
    try{
        const arr = JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) || '[]');
        if(!Array.isArray(arr)) return [];
        return arr.filter(p => p && p.name && typeof p.brightness==='number');
    }catch(e){ return []; }
}
// 保存一组自定义预设（整体覆盖写回）
function setCustomPresets(list){
    try{ localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(list || [])); }catch(e){}
}
// 新增一条自定义预设（自动生成唯一 key，去重同名则覆盖）
function addCustomPreset({name, icon, brightness, saturation, contrast}){
    const list = getCustomPresets();
    const key = 'custom_' + Date.now();
    // 同名则覆盖（保留用户最近一次编辑）
    const idx = list.findIndex(p => p.name === name);
    const item = { key, name, icon: icon || '🎨', brightness, saturation, contrast };
    if(idx >= 0){ item.key = list[idx].key; list[idx] = item; }
    else { list.push(item); }
    setCustomPresets(list);
    return item;
}
// 删除一条自定义预设
function removeCustomPreset(key){
    setCustomPresets(getCustomPresets().filter(p => p.key !== key));
}
// ★ 删除"当前激活（数值完全匹配）"的自定义预设（无匹配则不操作）
function removeCurrentCustomPreset(cur){
    const list = getCustomPresets();
    const match = list.find(p =>
        p.brightness === cur.b && p.saturation === cur.s && p.contrast === cur.c
    );
    if(match){ removeCustomPreset(match.key); }
    return match || null;
}
// ★ 重排：按给定的 key 顺序整体写回（拖拽排序后调用，持久化顺序）
function reorderCustomPresets(keyOrder){
    const map = {};
    getCustomPresets().forEach(p => { map[p.key] = p; });
    const next = [];
    (keyOrder || []).forEach(k => { if(map[k]){ next.push(map[k]); delete map[k]; } });
    // 兜底：把不在排序里的新增项追加到末尾
    Object.values(map).forEach(p => next.push(p));
    setCustomPresets(next);
}
// ★ 导入：合并外部预设数组（自动去重同名，key 冲突则换新 key 避免污染）
function importCustomPresets(items){
    const list = getCustomPresets();
    const usedKeys = new Set(list.map(p => p.key));
    let added = 0;
    (items || []).forEach(src => {
        if(!src || !src.name || typeof src.brightness !== 'number') return;
        let key = ('custom_' + Date.now() + '_' + added);
        while(usedKeys.has(key)){ key = key + '_' + Math.random().toString(36).slice(2,5); }
        usedKeys.add(key);
        list.push({
            key,
            name: String(src.name).slice(0,12),
            icon: src.icon || '🎨',
            brightness: +src.brightness, saturation: +src.saturation, contrast: +src.contrast
        });
        added++;
    });
    setCustomPresets(list);
    return added;
}
// ★ 导出：把自定义预设序列化（内置预设不包含，仅用户自建）
function exportCustomPresets(){
    return getCustomPresets().map(p => ({
        name: p.name, icon: p.icon,
        brightness: p.brightness, saturation: p.saturation, contrast: p.contrast
    }));
}
// ★ 清空全部自定义预设
function clearCustomPresets(){ setCustomPresets([]); }
// ★ 合并：内置预设 + 自定义预设（自定义追加在后面，供渲染时使用）
function getAllFilterPresets(){
    return [...FILTER_PRESETS, ...getCustomPresets()];
}
// ★ 对单个 video 应用当前保存的亮度/饱和度/对比度（filter）
function applyVideoFilter(videoEl){
    // 本地播放器的视频不受站点播放器设置影响，保持原始画面
    if(videoEl.closest && videoEl.closest('#local-player-mask')) return;
    const s = getPlayerSettings();
    const b = Math.max(0, Math.min(200, parseInt(s.brightness,10)||0));
    const sa = Math.max(0, Math.min(200, parseInt(s.saturation,10)||0));
    const c = Math.max(0, Math.min(200, parseInt(s.contrast,10)||0));
    try{
        videoEl.style.filter = `brightness(${b}%) saturate(${sa}%) contrast(${c}%)`;
    }catch(e){}
}
// ★ 让页面内所有 video 立即同步当前画面调节（保存设置 / 启动 / 新视频出现时调用）
function syncAllVideoFilter(){
    document.querySelectorAll('video').forEach(v=>{
        if(!v.closest || !v.closest('#local-player-mask')){
            applyVideoFilter(v);
        }
    });
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
// ★ 应用播放倍速（全局生效）：任何影片的 video 都套用同一倍速值
function applyPlaybackRate(videoEl, rate){
    // 本地播放器的视频不受全局倍速影响，保持自身播放速度
    if(videoEl.closest && videoEl.closest('#local-player-mask')) return;
    const r = (PLAYBACK_RATE_OPTIONS.includes(parseFloat(rate)) ? parseFloat(rate) : 1);
    try{
        if(videoEl.playbackRate !== r){
            videoEl.playbackRate = r;
        }
        // 部分播放器（如基于 videojs 的自建控件）通过 defaultPlaybackRate 初始化，一并设置
        videoEl.defaultPlaybackRate = r;
    }catch(e){}
}
// ★ 应用音量（全局生效）：任何影片的 video 都套用同一音量值，0~100 映射为 0~1
function applyVolume(videoEl, vol){
    // 本地播放器的视频不受全局音量影响，保持自身音量
    if(videoEl.closest && videoEl.closest('#local-player-mask')) return;
    try{
        const v = Math.max(0, Math.min(100, parseInt(vol, 10) || 0)) / 100;
        if(videoEl.volume !== v) videoEl.volume = v;
        // 音量为 0 时自动静音，非 0 时取消静音
        videoEl.muted = (v === 0 ? true : false);
    }catch(e){}
}
// ★ 让页面内所有 video 立即同步到当前保存的音量（保存设置/启动/新视频出现时调用）
function syncAllVolume(){
    const vol = getPlayerSettings().volume;
    document.querySelectorAll('video').forEach(v=>{
        if(!v.closest || !v.closest('#local-player-mask')){
            applyVolume(v, vol);
        }
    });
}
// ★ 让页面内所有 video 立即同步到当前保存的倍速（保存设置/启动/新视频出现时调用）
function syncAllPlaybackRate(){
    const rate = getPlayerSettings().playbackRate;
    const vol = getPlayerSettings().volume;
    document.querySelectorAll('video').forEach(v=>{
        if(!v.closest || !v.closest('#local-player-mask')){
            applyPlaybackRate(v, rate);
            applyVideoFilter(v);  // ★ 同步画面调节（亮度/饱和度/对比度）
            applyVolume(v, vol);  // ★ 同步音量
        }
    });
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
    // ---- ★ 倍速：对新发现的 video 立即应用已保存的全局倍速 ----
    applyPlaybackRate(videoEl, setting.playbackRate);
    // ---- ★ 音量：对新发现的 video 立即应用已保存的全局音量 ----
    applyVolume(videoEl, setting.volume);
    // ---- ★ 画面调节：对新发现的 video 立即应用已保存的亮度 / 饱和度 / 对比度 ----
    applyVideoFilter(videoEl);
    // 监听播放器控件/网页自身对倍速的修改（如原生右键倍速、video 标签 controls），
    // 同步写回设置，保证"当前页面改完，其它影片也用同一倍速"
    videoEl.addEventListener('ratechange', ()=>{
        const cur = parseFloat(videoEl.playbackRate) || 1;
        const saved = getPlayerSettings().playbackRate;
        if(cur !== saved && PLAYBACK_RATE_OPTIONS.includes(cur)){
            savePlayerSettings({ playbackRate: cur });
            console.log('[播放器设置] 🎚️ 倍速已同步为 '+cur+'x（全局生效）');
        }
    });
    // ---- 跳过片头：视频就绪后若当前进度仍在片头范围内，seek 到片头结束位置 ----
    const intro = Math.max(0, Math.min(900, parseInt(setting.skipIntro,10)||0));
    const outro = Math.max(0, Math.min(900, parseInt(setting.skipOutro,10)||0));
    let introDone = false;
    const trySkipIntro = ()=>{
        if(introDone) return;
        if(!intro) { introDone = true; return; }
        if(videoEl.readyState >= 1 && isFinite(videoEl.duration) && videoEl.duration > intro + 1){
            if(videoEl.currentTime < intro){
                try{ videoEl.currentTime = intro; introDone = true;
                    console.log('[播放器设置] ⏩ 已跳过片头 '+intro+' 秒');
                }catch(e){}
            }else{ introDone = true; }
        }
    };
    videoEl.addEventListener('loadedmetadata', ()=>{ trySkipIntro(); });
    // ---- ★ 自动全屏播放：全局设置开启后，影片元数据就绪即尝试放大全屏 ----
    videoEl.addEventListener('loadedmetadata', ()=>{
        try{
            if(!getPlayerSettings().autoFullscreen) return;
        }catch(e){ return; }
        if(document.fullscreenElement || document.webkitFullscreenElement){
            return; // 已在全屏，无需重复
        }
        if(typeof requestFullscreenOnVideo === 'function'){
            requestFullscreenOnVideo();
        }
    });
    videoEl.addEventListener('durationchange', ()=>{ trySkipIntro(); });
    videoEl.addEventListener('timeupdate', ()=>{
        if(!introDone) trySkipIntro();
        // ---- 跳过片尾：剩余时间 <= 设定值时自动跳下一集 ----
        if(outro && isFinite(videoEl.duration) && videoEl.duration > outro + 1){
            const remain = videoEl.duration - videoEl.currentTime;
            if(remain <= outro && !videoEl._hhkanOutroFired){
                videoEl._hhkanOutroFired = true;
                console.log('[播放器设置] ⏭️ 片尾倒计时到，自动下一集');
                if(typeof window.gotoNextEpisode === 'function'){
                    window.gotoNextEpisode();
                }else if(typeof navigateEpisode === 'function'){
                    navigateEpisode(1);
                }
            }
        }
    }, true);
    // 切换视频源时重置片尾触发标记
    videoEl.addEventListener('loadedmetadata', ()=>{ videoEl._hhkanOutroFired = false; });

    // ---- ★ 功能三：视频源加载失败 → 自动切换到其他线路（错误源自动切换）----
    // 触发时机：video 触发 error 事件，且当前已探测到更优线路（LINE_PROBE_KEY.bestIdx）时才自动切，
    // 避免在未知线路质量时盲目跳转；切换前先尝试「同集其他线路」，回退再到最快线路。
    videoEl.addEventListener('error', ()=>{
        if(videoEl._hhkanErrSwitched) return;           // 本视频只自动切一次，防死循环
        try{
            const rec = JSON.parse(localStorage.getItem(LINE_PROBE_KEY) || '{}');
            const ep = (typeof currentEpisodeNum==='function') ? currentEpisodeNum() : 0;
            const lines = (typeof extractAllLines==='function') ? extractAllLines() : [];
            let targetIdx = -1;
            // 优先：探测到的「最快线路」
            if(rec && typeof rec.bestIdx === 'number' && rec.bestIdx >= 0 && lines[rec.bestIdx]){
                targetIdx = rec.bestIdx;
            }
            if(targetIdx < 0) return;                    // 没有更优线路数据，放弃自动切
            const curIdx = (typeof getActiveLineIndex==='function') ? getActiveLineIndex() : -1;
            if(targetIdx === curIdx) return;             // 已在最优线路，无需切
            videoEl._hhkanErrSwitched = true;
            console.log('[错误源切换] 当前源加载失败，自动切换至线路 '+targetIdx);
            if(typeof showFloatTip==='function') showFloatTip('当前源加载失败，已自动切换线路…');
            // 先写选择记录，再切 tab；若当前有集数，尝试切到「同集」的最快线路
            const lineName = (lines[targetIdx] && lines[targetIdx].name) || ('线路'+(targetIdx+1));
            const upd = { lineIndex: targetIdx, lineName: lineName };
            if(ep > 0) upd.episodeNum = ep;
            if(typeof saveSelectRecord==='function') saveSelectRecord(upd);
            if(typeof switchLineTab==='function') switchLineTab(targetIdx);
        }catch(e){ console.warn('[错误源切换] 异常：', e); }
    });
}
function watchVideoElements(){
    if(videoObserver) videoObserver.disconnect();
    videoObserver = new MutationObserver(()=>{
        document.querySelectorAll('video').forEach(v=>{
            bindVideoPlayer(v);
        });
        // ★ 动态出现的 video 立即同步全局倍速（切集/切线路/新影片通用）
        syncAllPlaybackRate();
        // ★ 动态出现的 video 同步画面调节（亮度/饱和度/对比度）
        syncAllVideoFilter();
        updateFloatBallVisibility();
        // 视频元素出现 = 已进入播放页，触发一次自动检测
        if(hasVideoElement()){
            clearTimeout(watchVideoElements._detectTimer);
            watchVideoElements._detectTimer = setTimeout(autoDetectAndNotify, 600);
            // ★ 功能一：动态进入播放页时也检查是否可继续观看（防抖，仅首次触发）
            if(!watchVideoElements._resumeFired){
                watchVideoElements._resumeFired = true;
                setTimeout(checkAutoResume, 1000);
            }
        }
    })
    videoObserver.observe(document.body, {childList:true, subtree:true});
    document.querySelectorAll('video').forEach(v=>{
        bindVideoPlayer(v);
    });
    syncAllPlaybackRate();  // ★ 启动即应用全局倍速 + 画面调节
    syncAllVideoFilter();   // ★ 启动即应用已保存的亮度 / 饱和度 / 对比度
    syncAllVolume();        // ★ 启动即应用已保存的全局音量
    updateFloatBallVisibility();
    // 初始若有视频（如页面加载即带播放器），也检测一次
    if(hasVideoElement()){
        setTimeout(autoDetectAndNotify, 800);
        setTimeout(checkAutoResume, 1200);   // ★ 功能一：进入播放页自动提示继续观看
    }
}
// ===================== 【网页性能加速模块】开始 =====================
// ★ 全局设置「网页加速」开关控制：开启则注入 preconnect / 图片懒加载 / passive 监听等优化，
//   关闭则移除已注入的 link 与 style，停止图片优化观察器；函数可重复调用（幂等）。
const PERF_STYLE_ID = 'hhkan-perf-style';
let _hhkanPerfApplied = false;
let _hhkanImgObs = null;
function applyWebAccelerate(){
    if(_hhkanPerfApplied) return; // 已应用，避免重复注入
    const preDomains = (typeof getHhkanCandidates === 'function')
        ? [...getHhkanCandidates().map(h => _toHost(h)), "https://dl.hhkan0.com", hhkanHost()]
        : ["https://www.hhkan0.com", "https://dl.hhkan0.com"];
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
    perfStyle.id = PERF_STYLE_ID;
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
    // ★ passive 监听优化：仅在原生原型未被劫持时挂载，避免重复包装导致 this 指向异常
    if(!EventTarget.prototype.__hhkanPassivePatched){
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.__hhkanPassivePatched = true;
        EventTarget.prototype.addEventListener = function(type, listener, options){
            if((type === 'scroll' || type === 'touchmove' || type === 'touchstart') && typeof options !== "object"){
                options = { passive:true };
            }
            return originalAddEventListener.call(this, type, listener, options);
        }
    }
    window.idleRun = window.idleRun || function(cb, timeout = 2000){
        if(window.requestIdleCallback){
            requestIdleCallback(cb, {timeout});
        }else{
            setTimeout(cb, 10);
        }
    }
    window.debounce = window.debounce || function(fn, delay = 250){
        let timer;
        return (...args)=>{
            clearTimeout(timer);
            timer = setTimeout(()=>fn.apply(this,args), delay);
        }
    }
    window.idleRun(()=>optimizeImages());
    if(!_hhkanImgObs){
        _hhkanImgObs = new MutationObserver(window.debounce(()=>optimizeImages(),400));
        _hhkanImgObs.observe(document.body, {childList:true, subtree:true});
    }
    _hhkanPerfApplied = true;
}
// ★ 关闭网页加速：移除已注入的 preconnect / dns-prefetch / style，断开图片观察器
function removeWebAccelerate(){
    if(!_hhkanPerfApplied) return;
    document.querySelectorAll(`link[rel="preconnect"][href], link[rel="dns-prefetch"][href]`).forEach(l=>{
        const h = l.getAttribute('href') || '';
        // 仅移除本模块注入的 hhkan 相关域名，不动站点自身链接
        if(/hhkan|keke|18\.163\.11\.112/.test(h)){
            l.remove();
        }
    });
    const perfStyle = document.getElementById(PERF_STYLE_ID);
    if(perfStyle) perfStyle.remove();
    if(_hhkanImgObs){
        try{ _hhkanImgObs.disconnect(); }catch(e){}
        _hhkanImgObs = null;
    }
    _hhkanPerfApplied = false;
}
// ★ 读取网页加速开关（默认开启）：播放器设置 key 为 webAccelerate
function isWebAccelerateEnabled(){
    try{
        const s = getPlayerSettings();
        return s && s.webAccelerate !== false; // 默认 true
    }catch(e){ return true; }
}
// ★ 按当前开关状态应用 / 移除网页加速
function syncWebAccelerate(){
    if(isWebAccelerateEnabled()) applyWebAccelerate();
    else removeWebAccelerate();
}
// 页面加载后按开关决定是否启用加速（默认开启）
syncWebAccelerate();
// ===================== 【网页性能加速模块】结束 =====================

// ===================== 【hhkan 深色主题样式】开始 =====================
// ★ 让「播放器设置 / 全局设置 / 每日推荐」三个弹窗跟随可可影视（keke）的主题切换：
//   keke 通过 <html data-pp-theme="dark|light"> 控制主题，hhkan 弹窗原本是固定白底的
//   @media 媒体查询，无法跟随手动切换。这里单独生成一份以 [data-pp-theme="dark"] 为
//   作用域的深色样式表，白天模式自动失效，切主题时重建。
const HHKAN_DARK_STYLE_ID = 'hhkan-dark-theme-style';
function injectHhkanDarkCSS(){
    const css = `
/* ==================== 播放器设置弹窗 · 黑夜模式 ==================== */
[data-pp-theme="dark"] #player-setting-mask{
    background:rgba(0,0,0,0.72) !important;
    backdrop-filter:blur(4px);
}
[data-pp-theme="dark"] #player-setting-box{
    background:#171720 !important;
    color:#e6e6ea !important;
    box-shadow:0 16px 60px rgba(0,0,0,0.7) !important;
}
[data-pp-theme="dark"] #player-setting-box h3{ color:#f2f2f6 !important; }
[data-pp-theme="dark"] .setting-group{ border-bottom-color:#2a2a36 !important; }
[data-pp-theme="dark"] .setting-group:last-of-type{ border-bottom-color:transparent !important; }
[data-pp-theme="dark"] .setting-group label{ color:#e2e2e8 !important; }
[data-pp-theme="dark"] .setting-group label .setting-val{ color:#a29bfe !important; }
[data-pp-theme="dark"] .setting-desc{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .ps-reset-btn{ background:linear-gradient(135deg,#5b4bff,#a29bfe) !important; color:#fff !important; }
[data-pp-theme="dark"] .ps-tabs{ background:#22222e !important; }
[data-pp-theme="dark"] .ps-tab{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .ps-tab:hover{ color:#e2e2e8 !important; background:rgba(162,155,254,0.10) !important; }
[data-pp-theme="dark"] .ps-tab.ps-tab-active{
    background:#2e2e3c !important; color:#a29bfe !important;
    box-shadow:0 2px 10px rgba(0,0,0,0.5) !important;
}
[data-pp-theme="dark"] .fit-buttons button{
    background:#22222e !important; border-color:#34344a !important; color:#d4d4de !important;
}
[data-pp-theme="dark"] .fit-buttons button:hover{ border-color:#6a6a82 !important; color:#f0f0f6 !important; }
[data-pp-theme="dark"] .fit-buttons button.fit-active{
    background:#3a3a4a !important; color:#fff !important; border-color:#5b4bff !important;
}
[data-pp-theme="dark"] input[type="range"]{ accent-color:#a29bfe; }
/* 画面调节页 */
[data-pp-theme="dark"] #ps-tab-filter .custom-preset-box{
    background:#1c1c26 !important; border-color:#2e2e3c !important;
}
[data-pp-theme="dark"] .cp-title{ color:#e2e2e8 !important; }
[data-pp-theme="dark"] .filter-presets-label{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .filter-drawer-tip{ color:#8a8a96 !important; }
[data-pp-theme="dark"] .filter-preset-btn{
    background:#22222e !important; border-color:#34344a !important; color:#d4d4de !important;
}
[data-pp-theme="dark"] .filter-preset-btn:hover{ border-color:#a29bfe !important; color:#fff !important; }
[data-pp-theme="dark"] .filter-preset-btn.preset-active{
    background:#3a2f5e !important; border-color:#a29bfe !important; color:#e8e2ff !important;
}
[data-pp-theme="dark"] .cp-tab{ background:#22222e !important; color:#9a9aa6 !important; }
[data-pp-theme="dark"] .cp-tab.cp-tab-active{ background:#a29bfe !important; color:#15151c !important; }
[data-pp-theme="dark"] .cp-tab-count{ background:#34344a !important; color:#e2e2e8 !important; }
[data-pp-theme="dark"] .cp-empty{ color:#8a8a96 !important; }
[data-pp-theme="dark"] .cp-action-btn{
    background:#22222e !important; color:#d4d4de !important; border-color:#34344a !important;
}
[data-pp-theme="dark"] .cp-action-btn:hover{ background:#2e2e3c !important; color:#fff !important; }
[data-pp-theme="dark"] .cp-name{
    background:#15151c !important; color:#e6e6ea !important; border-color:#34344a !important;
}
[data-pp-theme="dark"] .cp-current{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .cp-current b{ color:#a29bfe !important; }
[data-pp-theme="dark"] .cp-save-btn{
    background:linear-gradient(135deg,#5b4bff,#a29bfe) !important; color:#fff !important;
}
[data-pp-theme="dark"] .cp-save-btn:hover{ filter:brightness(1.1); }
[data-pp-theme="dark"] .cp-del{ color:#8a8a96 !important; }
[data-pp-theme="dark"] .cp-del:hover{ color:#ff6b6b !important; }
/* ==================== 全局设置弹窗 · 黑夜模式 ==================== */
[data-pp-theme="dark"] #hhkan-enhance-settings,
[data-pp-theme="dark"] .hes-result-mask{
    background:rgba(0,0,0,0.72) !important;
    backdrop-filter:blur(4px);
}
[data-pp-theme="dark"] .hes-box{
    background:#171720 !important; color:#e6e6ea !important;
    box-shadow:0 16px 60px rgba(0,0,0,0.7) !important;
}
[data-pp-theme="dark"] .hes-head{ color:#f2f2f6 !important; border-bottom-color:#2a2a36 !important; }
[data-pp-theme="dark"] .hes-close{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .hes-close:hover{ color:#fff !important; background:#2e2e3c !important; }
[data-pp-theme="dark"] .hes-row{ color:#d4d4de !important; }
[data-pp-theme="dark"] .hes-divider{
    background:linear-gradient(90deg,transparent,#2a2a36 18%,#2a2a36 82%,transparent) !important;
}
[data-pp-theme="dark"] .hes-row input[type=number]{
    background:#15151c !important; color:#e6e6ea !important; border-color:#34344a !important;
}
[data-pp-theme="dark"] .hes-num-wrap input[type=number]{
    background:#15151c !important; color:#e6e6ea !important; border-color:#34344a !important;
}
[data-pp-theme="dark"] .hes-num-unit{ background:#24242e !important; color:#9a9aa6 !important; border-color:#34344a !important; }
[data-pp-theme="dark"] .hes-keymap{
    background:#1c1c26 !important; border-color:#2a2a36 !important; color:#c8c8d2 !important;
}
[data-pp-theme="dark"] .hes-keymap-title{ color:#e8e8ee !important; }
[data-pp-theme="dark"] .hes-keymap-badge{
    background:#2e2e3c !important; color:#a29bfe !important;
}
[data-pp-theme="dark"] .hes-keymap-table{ border-color:#2a2a36 !important; }
[data-pp-theme="dark"] .hes-keymap-table th{
    background:#24242e !important; color:#e0e0e8 !important; border-bottom-color:#34344a !important;
}
[data-pp-theme="dark"] .hes-keymap-table td{ border-bottom-color:#26262f !important; color:#c8c8d2 !important; }
[data-pp-theme="dark"] .hes-keymap-table .col-func{ color:#e0e0e8 !important; }
[data-pp-theme="dark"] .hes-keymap-table .col-desc{ color:#8a8a96 !important; }
[data-pp-theme="dark"] .hes-keymap-sub{ color:#8a8a96 !important; }
[data-pp-theme="dark"] .hes-keymap kbd,
[data-pp-theme="dark"] .hes-keymap-sub kbd{
    background:#24242e !important; color:#a29bfe !important; border-color:#3a3a4a !important;
}
[data-pp-theme="dark"] .key-or{ color:#7a7a86 !important; }
[data-pp-theme="dark"] .hes-foot{ border-top-color:#2a2a36 !important; }
[data-pp-theme="dark"] .hes-reset{
    background:#2e2e3c !important; color:#d4d4de !important;
}
[data-pp-theme="dark"] .hes-reset:hover{ background:#3a3a4a !important; color:#fff !important; }
[data-pp-theme="dark"] .hes-save{
    background:linear-gradient(135deg,#5b4bff,#a29bfe) !important; color:#fff !important;
}
/* 结果弹窗 */
[data-pp-theme="dark"] .hes-result-box{
    background:#1c1c26 !important; color:#e6e6ea !important;
    box-shadow:0 16px 60px rgba(0,0,0,0.7) !important;
}
[data-pp-theme="dark"] .hes-result-title{ color:#f2f2f6 !important; }
[data-pp-theme="dark"] .hes-result-desc{ color:#b8b8c4 !important; }
[data-pp-theme="dark"] .hes-result-ok{
    background:#2e2e3c !important; color:#e6e6ea !important;
}
[data-pp-theme="dark"] .hes-result-ok:hover{ background:#3a3a4a !important; }
/* ==================== 每日推荐弹窗 · 黑夜模式 ==================== */
[data-pp-theme="dark"] #recommend-modal-mask{
    background:rgba(10,10,14,0.96) !important;
}
[data-pp-theme="dark"] #recommend-modal-box{
    background:#12121a !important; color:#e6e6ea !important;
}
[data-pp-theme="dark"] #recommend-modal-box h4{ color:#f2f2f6 !important; }
[data-pp-theme="dark"] #recommend-modal-box div[style*="color:#888"],
[data-pp-theme="dark"] #recommend-modal-box div[style*="color: #888"]{
    color:#9a9aa6 !important;
}
[data-pp-theme="dark"] .rec-block-title{
    color:#ececf2 !important; border-bottom-color:#2a2a36 !important;
}
[data-pp-theme="dark"] .rec-item{
    background:#1c1c26 !important; border-color:#2e2e3c !important; color:#dcdce2 !important;
}
[data-pp-theme="dark"] .rec-item:hover{
    background:#26262f !important; border-color:#a29bfe !important; color:#fff !important;
}
[data-pp-theme="dark"] .rec-item div[style*="color:#666"],
[data-pp-theme="dark"] .rec-item div[style*="color: #666"]{
    color:#9a9aa6 !important;
}
[data-pp-theme="dark"] .rec-source-tag.dynamic{
    background:#1f2a3a !important; color:#6ea8fe !important;
}
[data-pp-theme="dark"] .rec-source-tag.fallback{
    background:#22222e !important; color:#9a9aa6 !important;
}
[data-pp-theme="dark"] .rank-1{ color:#ff8a80 !important; }
[data-pp-theme="dark"] .rank-2{ color:#ffb74d !important; }
[data-pp-theme="dark"] .rank-3{ color:#ffe082 !important; }
[data-pp-theme="dark"] .rank-normal{ color:#a0a0aa !important; }
[data-pp-theme="dark"] #rec-close-btn{
    background:#2e2e3c !important; color:#fff !important;
}
[data-pp-theme="dark"] #rec-close-btn:hover{ background:#3a3a4a !important; }
[data-pp-theme="dark"] .rec-loading{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .rec-loading .mi-sub{ color:#7a7a86 !important; }
[data-pp-theme="dark"] .rec-loading .mi-spinner{
    border-color:#2a2a36 !important; border-top-color:#a29bfe !important;
}
/* ==================== 继续观看弹窗 · 黑夜模式（BUG 一修复：补全适配） ==================== */
[data-pp-theme="dark"] #hhkan-continue-mask{
    background:rgba(0,0,0,0.72) !important;
    backdrop-filter:blur(4px);
}
[data-pp-theme="dark"] .hc-box{
    background:#171720 !important; color:#e6e6ea !important;
    box-shadow:0 16px 60px rgba(0,0,0,0.7) !important;
}
[data-pp-theme="dark"] .hc-head{ color:#f2f2f6 !important; }
[data-pp-theme="dark"] .hc-close{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .hc-close:hover{ color:#fff !important; background:#2e2e3c !important; }
[data-pp-theme="dark"] .hc-clearall{ background:#2e1f22 !important; color:#ff9a9a !important; border-color:#5a3036 !important; }
[data-pp-theme="dark"] .hc-clearall:hover{ background:#3a2529 !important; }
[data-pp-theme="dark"] .hc-item{ background:#1e1e28 !important; }
[data-pp-theme="dark"] .hc-item-main{ color:#e2e2e8 !important; }
[data-pp-theme="dark"] .hc-item-main:hover{ background:#26262f !important; }
[data-pp-theme="dark"] .hc-del{ background:#2e1f22 !important; border-color:#5a3036 !important; color:#ff9a9a !important; }
[data-pp-theme="dark"] .hc-del:hover{ background:#3a2529 !important; }
[data-pp-theme="dark"] .hc-title{ color:#ececf2 !important; }
[data-pp-theme="dark"] .hc-meta{ color:#9a9aa6 !important; }
[data-pp-theme="dark"] .hc-bar{ background:#2a2a36 !important; }
[data-pp-theme="dark"] .hc-empty{ color:#8a8a96 !important; }
[data-pp-theme="dark"] .hc-poster{ background:#2a2a36 !important; }
/* ==================== 更新公告弹窗 · 黑夜模式（如挂在 hhkan 作用域内） ==================== */
[data-pp-theme="dark"] #pake-disclaimer-mask{
    background:rgba(0,0,0,0.72) !important;
    backdrop-filter:blur(4px);
}
`;
    let st = document.getElementById(HHKAN_DARK_STYLE_ID);
    if(!st){
        st = document.createElement('style');
        st.id = HHKAN_DARK_STYLE_ID;
        (document.head || document.documentElement).appendChild(st);
    }
    st.textContent = css;
}
// ★ 移除 hhkan 深色样式（切到白天时调用，避免残留覆盖站点原生白底）
function removeHhkanDarkCSS(){
    const st = document.getElementById(HHKAN_DARK_STYLE_ID);
    if(st) st.remove();
}
// ★ 根据当前主题决定注入 / 移除深色样式（幂等，可重复调用）
// ★ 【关键修复 BUG 一】主题判定同时读取 <html data-pp-theme> 属性与 keke 的持久化键
//   pp_theme_mode，避免「脚本注入时属性尚未写入、首次加载即为黑夜」时拿不到主题、
//   导致每日推荐 / 全局设置 / 播放设置 / 继续观看 弹窗以白底渲染。
//   判定优先级：URL ?theme=dark|light > 属性 > body 类 > keke 模块变量 ppThemeState
//   > 通用持久化键(black_theme/dark_theme/theme) > keke 持久化记忆(pp_theme_mode) > 默认白天。
function _detectHhkanDarkMode(){
    let mode = '';
    try{ mode = (document.documentElement && document.documentElement.getAttribute('data-pp-theme')) || ''; }catch(e){}
    if(!mode){
        const href = (window.location && window.location.href) || '';
        if(/[?&]theme=dark(&|#|$)/i.test(href)) mode = 'dark';
        else if(/[?&]theme=light(&|#|$)/i.test(href)) mode = 'light';
    }
    if(!mode){
        try{ mode = (document.body && document.body.getAttribute('data-pp-theme')) || ''; }catch(e){}
    }
    if(!mode){
        // ★ 兼容 keke 模块内部通过闭包变量记录主题的场景（部分版本挂在 document 上）
        try{
            const s = (document.ppThemeState || (window.__keke && window.__keke.themeState) || '');
            if(s && String(s).toLowerCase().indexOf('dark') >= 0) mode = 'dark';
            else if(s && String(s).toLowerCase().indexOf('light') >= 0) mode = 'light';
        }catch(e){}
    }
    if(!mode){
        // ★ 兜底：尝试常见主题持久化键（覆盖更多打包版本）
        try{
            const cand = ['pp_theme_mode','black_theme','dark_theme','theme','pake_theme','keke_theme'];
            for(const k of cand){
                const v = window.localStorage.getItem(k);
                if(v && (v === 'dark' || v === 'black' || v === '#000')){ mode = 'dark'; break; }
                if(v && (v === 'light' || v === 'white')){ mode = 'light'; break; }
            }
        }catch(e){}
    }
    return mode;
}
function syncHhkanDarkTheme(){
    const mode = _detectHhkanDarkMode();
    if(mode === 'dark') injectHhkanDarkCSS();
    else removeHhkanDarkCSS();
}
// ★ 【优化四 · 核心修复】启动阶段即预注入深色样式 —— 三重保险彻底消除黑夜首屏白底
//
// 问题根源：原实现存在「时序竞争」——
//   injectHhkanDarkCSS() 的定义在第 1114 行，但 preInjectOnBoot 在调用它时，
//   如果脚本是分段执行或存在异步加载，可能拿不到最新的样式内容；
//   同时 _detectHhkanDarkMode() 需要读取 DOM 属性，在脚本解析阶段 DOM 可能尚未就绪。
//
// 修复方案：
//   1. 立即读取 localStorage（同步，不依赖 DOM），判定是否为黑夜
//   2. 若黑夜 → 立即注入一段「纯黑兜底样式」（不依赖 injectHhkanDarkCSS）
//   3. 待 DOM 就绪后，再用完整版 injectHhkanDarkCSS() 替换兜底样式
//   4. 全程监听主题变化，确保「只有主动切换到白天时才会变白」

// ---- 第一步：立即判定主题（同步，读 localStorage，不依赖 DOM）----
(function preInjectOnBoot(){
    let mode = '';
    try{
        // 优先级：URL 参数 > localStorage 持久化键
        const href = (window.location && window.location.href) || '';
        if(/[?&]theme=dark(&|#|$)/i.test(href)) mode = 'dark';
        else if(/[?&]theme=light(&|#|$)/i.test(href)) mode = 'light';
        if(!mode){
            const cand = ['pp_theme_mode','black_theme','dark_theme','theme','pake_theme','keke_theme'];
            for(const k of cand){
                const v = window.localStorage.getItem(k);
                if(v && (v === 'dark' || v === 'black' || v === '#000')){ mode = 'dark'; break; }
                if(v && (v === 'light' || v === 'white')){ mode = 'light'; break; }
            }
        }
    }catch(e){}
    // ★ 关键：黑夜模式下，立即写入 <html> 属性 + 注入纯黑兜底样式
    //   这样在 injectHhkanDarkCSS() 的完整样式生效前，页面已经是深色
    if(mode === 'dark'){
        try{ document.documentElement.setAttribute('data-pp-theme', 'dark'); }catch(e){}
        _injectDarkFallbackCSS();
    }
})();

// ---- 第二步：注入「纯黑兜底样式」（最小化、即时生效）----
//   这段样式在 injectHhkanDarkCSS() 之前执行，确保首帧不露白
function _injectDarkFallbackCSS(){
    if(document.getElementById('hhkan-dark-fallback')) return;
    const s = document.createElement('style');
    s.id = 'hhkan-dark-fallback';
    s.textContent = `
        /* ★ 首帧兜底：黑夜模式下，确保 html/body 不露白 */
        html[data-pp-theme="dark"],
        html[data-pp-theme="dark"] body{
            background:#000 !important;
            color:#e6e6ea !important;
        }
        /* 四个核心弹窗的黑夜兜底（每日推荐/继续观看/全局设置/播放设置） */
        html[data-pp-theme="dark"] #recommend-modal-mask,
        html[data-pp-theme="dark"] #hhkan-continue-mask,
        html[data-pp-theme="dark"] #hhkan-enhance-settings,
        html[data-pp-theme="dark"] #player-setting-mask{
            background:rgba(0,0,0,0.85) !important;
        }
        html[data-pp-theme="dark"] #recommend-modal-box,
        html[data-pp-theme="dark"] .hc-box,
        html[data-pp-theme="dark"] .hes-box,
        html[data-pp-theme="dark"] #player-setting-box{
            background:#171720 !important;
            color:#e6e6ea !important;
            box-shadow:0 16px 60px rgba(0,0,0,0.7) !important;
        }
        /* 更新公告弹窗 */
        html[data-pp-theme="dark"] #pake-disclaimer-mask{
            background:rgba(0,0,0,0.85) !important;
        }
        html[data-pp-theme="dark"] #pake-disclaimer-box{
            background:#171720 !important;
            color:#e6e6ea !important;
        }
        html[data-pp-theme="dark"] #pake-disclaimer-box h3,
        html[data-pp-theme="dark"] #pake-disclaimer-box .notice-head{
            color:#f2f2f6 !important;
        }
        html[data-pp-theme="dark"] #pake-disclaimer-box .notice-item{
            color:#c8c8d2 !important;
        }
    `;
    const target = document.head || document.documentElement || document.body;
    if(target) target.appendChild(s);
}

// ---- 第三步：DOM 就绪后注入完整深色样式 ----
//   完整版 injectHhkanDarkCSS() 包含更多细节规则，替换掉兜底样式
function _injectFullDarkCSSWhenReady(){
    // 已判定为黑夜才注入
    let mode = '';
    try{
        mode = document.documentElement.getAttribute('data-pp-theme') || '';
        if(!mode){
            const cand = ['pp_theme_mode','black_theme','dark_theme','theme','pake_theme','keke_theme'];
            for(const k of cand){
                const v = window.localStorage.getItem(k);
                if(v && (v === 'dark' || v === 'black' || v === '#000')){ mode = 'dark'; break; }
            }
        }
    }catch(e){}
    if(mode === 'dark'){
        injectHhkanDarkCSS();
        // 完整样式注入后，移除兜底（避免重复规则影响性能）
        const fb = document.getElementById('hhkan-dark-fallback');
        if(fb) fb.remove();
    }
}

// 页面加载即按当前主题执行一次
syncHhkanDarkTheme();
// DOMContentLoaded 时注入完整深色样式
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _injectFullDarkCSSWhenReady);
}else{
    _injectFullDarkCSSWhenReady();
}
// ★ 兜底：window.load 时再同步一次
if(window.addEventListener){
    window.addEventListener('load', syncHhkanDarkTheme);
    window.addEventListener('load', _injectFullDarkCSSWhenReady);
}
// ★ 【核心】拦截 document.documentElement.setAttribute，
//   一旦 keke 写入 data-pp-theme="dark"，立即同步注入深色样式
(function patchSetAttribute(){
    const html = document.documentElement;
    if(!html || typeof html.setAttribute !== 'function') return;
    let patched = false;
    try{ patched = html.__hhkanThemePatched; }catch(e){}
    if(patched) return;
    const orig = html.setAttribute.bind(html);
    html.setAttribute = function(name, value){
        const r = orig(name, value);
        if(name === 'data-pp-theme'){
            if(String(value) === 'dark'){
                _injectDarkFallbackCSS();
                injectHhkanDarkCSS();
            }else{
                removeHhkanDarkCSS();
            }
        }
        return r;
    };
    try{ html.__hhkanThemePatched = true; }catch(e){}
})();
// ★ 监听 <html data-pp-theme> 属性变化，主题切换时自动重建 / 移除样式表
(function watchHhkanTheme(){
    let last = document.documentElement ? document.documentElement.getAttribute('data-pp-theme') : '';
    setInterval(()=>{
        const cur = document.documentElement ? document.documentElement.getAttribute('data-pp-theme') : '';
        if(cur !== last){
            last = cur;
            syncHhkanDarkTheme();
            if(cur === 'dark') _injectDarkFallbackCSS();
        }
    }, 200);
    // ★ 针对「重进页面」的极端兜底：多帧重检
    [50, 200, 500, 1000, 2000, 3000].forEach(delay=>{
        setTimeout(()=>{
            syncHhkanDarkTheme();
            _injectFullDarkCSSWhenReady();
        }, delay);
    });
})();
// ===================== 【hhkan 深色主题样式】结束 =====================
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
// ==================== 背景图库 · 随机壁纸（内嵌 · 不叠加 · 不重复 · 彩色主题）====================
// ★ 优化二 · 设计要点（解决「壁纸黑白」+「分类与图片不符」两个核心问题）：
//   ① 图源改为【彩色主题化壁纸】：每个分类重新规划，每类配置专属的「主色 / 辅色 / 点缀色 /
//      装饰元素 / emoji 主角」，用 SVG 程序化生成，保证"分类里出的图真贴合该分类主题"；
//      例如「二次元动漫」出粉紫梦幻风 + 星光与爱心，「星空宇宙」出深空紫蓝 + 星球星轨，
//      彻底告别"分类名是动漫、出的全是随机风景灰度图"的错位。
//   ② 全图彩色：移除原来的 ?grayscale 灰度参数，采用彩色 SVG + 透明几何装饰，
//      并在兜底/网络异常时也保持彩色，不再出现黑白图。
//   ③ 每个分类独占 50 个种子（seg 区间），分类之间绝不重叠 → 不叠加；
//      「换一批」按不重复洗牌：把本类 50 个种子打散，逐个消耗，抽完才重置。
//   ④ 每张图由「分类种子 + 分类主题配色」唯一确定，同种子同分类出图稳定可缓存，
//      不同批次通过颜色扰动/装饰密度错开，避免视觉重复又保证彩色一致。
//   ⑤ 网络不可达时回退到「分类专属彩色渐变 + 主题装饰 + emoji」的本地图，永不黑白/白块。

// 按分类 + 种子生成一张【彩色主题化】壁纸 dataURI（SVG）
// 参数：cat 分类对象（含 theme 主题配置）、seed 该类内的偏移量、batch 换批计数
function _bgWallUrl(cat, offset, batch){
    const t = (cat.theme && typeof cat.theme === 'object') ? cat.theme : null;
    // 无主题配置时回退到纯彩色渐变兜底
    if(!t){
        const tint = (HHKAN_PROFILE.catTint && HHKAN_PROFILE.catTint[cat.name]) || '#7f5cff';
        return _bgColorFallback(tint, cat.icon || '🖼️', offset);
    }
    // 由分类种子 + 批次共同算出本张图的扰动值，保证同种子稳定、不同批次有变化
    const rand = (n)=>{
        let h = 2166136261 ^ cat.seg[0] ^ (offset * 374761393) ^ (batch * 668265263);
        for(let i=0;i<n;i++){ h = Math.imul(h ^ (h >>> 16), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); }
        h ^= h >>> 16;
        return ((h >>> 0) % 10000) / 10000;
    };
    const r = rand(4);
    // 主题色：主色 + 辅色 + 点缀色，均取分类专属配色
    const c1 = t.c1, c2 = t.c2, accent = t.accent || t.c1;
    const deco = t.deco || 'circles';   // 装饰元素：circles / stars / grid / waves / sakura / hearts / geometric
    const emojis = (t.emojis && t.emojis.length) ? t.emojis : [];
    const emojiSize = t.emojiSize || 34;

    // 构建装饰图层（彩色）
    let decor = '';
    if(deco === 'stars'){
        // 星空：散布星点 + 流星
        for(let i=0;i<26;i++){
            const x = ((r * 7 + i * 37) % 100), y = ((r * 13 + i * 23) % 100);
            const rr = (1 + ((r * 11 + i) % 100) / 100 * 2.2).toFixed(2);
            const o = (0.5 + ((r * 17 + i * 3) % 100) / 100 * 0.5).toFixed(2);
            decor += `<circle cx="${x}%" cy="${y}%" r="${rr}" fill="#fff" opacity="${o}"/><circle cx="${x}%" cy="${y}%" r="${(rr*2.4).toFixed(2)}" fill="#fff" opacity="${(o*0.25).toFixed(2)}"/>`;
        }
        // 流星
        decor += `<g opacity="0.9"><line x1="78%" y1="8%" x2="60%" y2="26%" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.9"/><circle cx="78%" cy="8%" r="3" fill="#fff"/></g>`;
    }else if(deco === 'grid'){
        // 科技网格
        for(let gx=0;gx<=10;gx++){
            decor += `<line x1="${gx*10}%" y1="0" x2="${gx*10}%" y2="100%" stroke="${accent}" stroke-width="1" opacity="0.18"/>`;
        }
        for(let gy=0;gy<=6;gy++){
            decor += `<line x1="0" y1="${gy*16.66}%" x2="100%" y2="${gy*16.66}%" stroke="${accent}" stroke-width="1" opacity="0.14"/>`;
        }
        for(let i=0;i<8;i++){
            const cx=((r*9+i*41)%100), cy=((r*19+i*29)%100), rr=(14+((r*7+i)%100)/100*30).toFixed(1);
            decor += `<circle cx="${cx}%" cy="${cy}%" r="${rr}" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.35"/>`;
        }
    }else if(deco === 'waves'){
        // 流体波浪
        for(let w=0;w<4;w++){
            const y0 = 30 + w * 16 + ((r*9)%8);
            decor += `<path d="M0 ${y0}% Q25 ${y0-10}%,50 ${y0}% T100 ${y0}%" fill="none" stroke="${accent}" stroke-width="3" opacity="${(0.28 - w*0.05).toFixed(2)}"/>`;
        }
        for(let i=0;i<18;i++){
            const cx=((r*11+i*31)%100), cy=((r*23+i*17)%100), rr=(1.5+((r*5+i)%100)/100*2.5).toFixed(2);
            decor += `<circle cx="${cx}%" cy="${cy}%" r="${rr}" fill="#ffffff" opacity="0.5"/>`;
        }
    }else if(deco === 'sakura'){
        // 樱花花瓣
        for(let i=0;i<20;i++){
            const cx=((r*7+i*37)%100), cy=((r*13+i*23)%100), sz=(8+((r*11+i)%100)/100*14).toFixed(1);
            decor += `<g transform="translate(${cx} ${cy}) rotate(${(i*23)%360})"><path d="M0 0 C${sz*0.6} -${sz*1.1},${sz} -${sz*0.9},0 -${sz*1.4} C-${sz} -${sz*0.9},-${sz*0.6} -${sz*1.1},0 0Z" fill="${accent}" opacity="0.85"/><path d="M0 0 C${sz*0.5} ${sz*0.5},${sz*0.8} ${sz*0.9},0 ${sz} C${sz*0.8} ${sz*0.9},${sz*0.5} ${sz*0.5},0 0Z" fill="#fff" opacity="0.35"/></g>`;
        }
    }else if(deco === 'hearts'){
        // 爱心点缀
        for(let i=0;i<16;i++){
            const cx=((r*7+i*37)%100), cy=((r*13+i*23)%100);
            const sz=(10+((r*11+i)%100)/100*18).toFixed(1);
            decor += `<g transform="translate(${cx} ${cy}) rotate(${(i%2?-8:8)}) scale(${(sz/20).toFixed(2)})"><path d="M0 7 A6 6 0 0 1 12 7 A6 6 0 0 1 0 7 Q0 14 -12 7 A6 6 0 0 1 0 7Z" fill="${accent}" opacity="0.8" transform="translate(0 -5)"/></g>`;
        }
    }else if(deco === 'geometric'){
        // 几何抽象
        for(let i=0;i<14;i++){
            const cx=((r*7+i*37)%100), cy=((r*13+i*23)%100), sz=(16+((r*11+i)%100)/100*34).toFixed(1), rot=(i*27)%180;
            if(i%3===0) decor += `<rect x="${cx}%" y="${cy}%" width="${sz}" height="${sz}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.4" transform="rotate(${rot} ${cx}% ${cy}%)"/>`;
            else if(i%3===1) decor += `<circle cx="${cx}%" cy="${cy}%" r="${sz*0.6}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.4"/>`;
            else decor += `<polygon points="${cx},${cy-sz*0.7} ${cx+sz*0.6},${cy+sz*0.4} ${cx-sz*0.6},${cy+sz*0.4}" fill="${accent}" opacity="0.35"/>`;
        }
    }else{
        // 默认：光晕 + 气泡
        for(let i=0;i<15;i++){
            const cx=((r*7+i*37)%100), cy=((r*13+i*23)%100), rr=(6+((r*11+i)%100)/100*22).toFixed(1);
            decor += `<circle cx="${cx}%" cy="${cy}%" r="${rr}" fill="${accent}" opacity="${(0.16 - i*0.006).toFixed(2)}"/>`;
        }
    }

    // emoji 主角：在画面合适位置点缀 1~3 个分类主题 emoji
    let emojiLayer = '';
    if(emojis.length){
        const n = 1 + ((Math.floor(r*1000) + offset) % Math.min(3, emojis.length));
        for(let i=0;i<n;i++){
            const e = emojis[(offset + i) % emojis.length];
            const ex = (16 + ((r*11 + i*41 + offset*7) % 70)).toFixed(1);
            const ey = (22 + ((r*23 + i*31 + offset*13) % 56)).toFixed(1);
            const es = (emojiSize + ((r*5 + i*7 + offset) % 14)).toFixed(0);
            emojiLayer += `<text x="${ex}%" y="${ey}%" font-size="${es}" text-anchor="middle" dominant-baseline="central" opacity="0.95">${e}</text>`;
        }
    }

    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">' +
        '<defs>' +
        `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="55%" stop-color="${c2}"/><stop offset="100%" stop-color="${c1}"/></linearGradient>` +
        `<radialGradient id="vign" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,0.28)"/></radialGradient>` +
        '</defs>' +
        `<rect width="640" height="360" fill="url(#g)"/>` +
        decor +
        emojiLayer +
        `<rect width="640" height="360" fill="url(#vign)"/>` +
        '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// 纯彩色渐变兜底图（无主题配置时）：绝不黑白
function _bgColorFallback(tint, icon, offset){
    let h = 0;
    const key = (tint || '') + offset;
    for(let i=0;i<key.length;i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    const c2 = `hsl(${h % 360},72%,56%)`;
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        `<stop offset="0%" stop-color="${tint}"/><stop offset="100%" stop-color="${c2}"/>` +
        '</linearGradient></defs>' +
        `<rect width="400" height="225" fill="url(#g)"/>` +
        `<text x="50%" y="52%" font-size="60" text-anchor="middle" fill="rgba(255,255,255,.9)" font-family="sans-serif">${icon || '🖼️'}</text>` +
        '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// 分类专属彩色兜底图（SVG dataURI）：网络不通时本地出图，彩色且不破图/白块
function _bgFallbackDataUrl(cat, offset){
    const t = (cat.theme && typeof cat.theme === 'object') ? cat.theme : null;
    if(t) return _bgWallUrl(cat, offset, 0);
    const tint = (HHKAN_PROFILE.catTint && HHKAN_PROFILE.catTint[cat.name]) || '#7f5cff';
    return _bgColorFallback(tint, cat.icon || '🖼️', offset);
}

// ★ 核心：返回某分类本次「换一批」要展示的 perPage 张 URL 列表（不重复、不叠加）
//   策略：把本类 50 个 seed 洗牌成一个顺序队列，每次取 perPage 个，抽完再洗；
//         跨分类各自独立队列，互不污染。
const _bgDeck = new Map();          // cat.name -> { order:[seed偏移], idx:当前位置, batch:换批计数 }
function _bgDeckFor(cat){
    if(!_bgDeck.has(cat.name)){
        const total = cat.seg[1] - cat.seg[0];   // 恒为 PER_CAT = 50
        const order = [];
        for(let i=0;i<total;i++) order.push(i);
        // Fisher–Yates 洗牌（用分类名做额外扰动，让每类起始顺序也不同）
        let h = 0;
        for(let i=0;i<cat.name.length;i++) h = (h * 31 + cat.name.charCodeAt(i)) >>> 0;
        for(let i=order.length-1;i>0;i--){
            h = (h * 1103515245 + 12345) >>> 0;
            const j = (h >>> 0) % (i + 1);
            [order[i], order[j]] = [order[j], order[i]];
        }
        _bgDeck.set(cat.name, { order: order, idx: 0, batch: 0, total: total });
    }
    return _bgDeck.get(cat.name);
}
function _bgShuffle(arr, salt){
    // 带盐洗牌：同一 50 张每次换批都重排，保证同一区间内不出现相同序列
    const a = arr.slice();
    let h = (salt >>> 0) || 1;
    for(let i=a.length-1;i>0;i--){
        h = (h * 1103515245 + 12345) >>> 0;
        const j = h % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function getBgWallUrls(cat, count){
    const d = _bgDeckFor(cat);
    const perPage = Math.max(1, count || HHKAN_PROFILE.perPage);
    // 队列不足 perPage 时：把剩余全取出 + 重新洗牌补足，绝不重复元素
    const out = [];
    let safety = 0;
    while(out.length < perPage && safety < perPage * 2){
        safety++;
        if(d.idx >= d.order.length){
            d.order = _bgShuffle(d.order, ++d.batch * 9973 + cat.name.length);
            d.idx = 0;
        }
        out.push(d.order[d.idx++]);
    }
    // 转成真实 URL（offset → seed → 带尺寸/质量参数的 picsum 地址）
    return out.map(off => _bgWallUrl(cat, off, d.batch));
}
// 对外：直接拿到一张随机壁纸 URL（供「随机换一张背景」类快捷入口使用）
function getRandomBgUrl(cat){
    const c = cat || HHKAN_PROFILE.bgCategories[Math.floor(Math.random()*HHKAN_PROFILE.bgCategories.length)];
    const off = Math.floor(Math.random() * (c.seg[1] - c.seg[0]));
    return _bgWallUrl(c, off, Math.floor(Math.random()*8));
}

// 渲染一张背景图卡片（统一供两个面板复用）
// 点击即设为个人主页背景，并写入使用记录
function _renderBgWallItem(hostOrMask, url, title, tint, onFallback){
    const item = document.createElement('div');
    item.className = 'hhkan-pp-ai-item hhkan-pp-bg-wall';
    item.style.backgroundImage = `url("${url}")`;
    item.style.backgroundColor = tint || '#7f5cff';
    item.title = title || '随机壁纸';
    // ★ 渐入：图片加载完成才显示，避免碎图/半截图闪烁
    item.classList.add('hhkan-pp-bg-loading');
    const probe = new Image();
    probe.onload = ()=> item.classList.remove('hhkan-pp-bg-loading');
    probe.onerror = ()=>{
        // 网络失败时降级到本地 SVG 兜底（仅一次，避免递归）
        if(onFallback){
            const fb = onFallback();
            item.style.backgroundImage = `url("${fb}")`;
        }
        item.classList.remove('hhkan-pp-bg-loading');
    };
    probe.src = url;
    // ★ 优化二：点击壁纸先弹出「精美确认弹窗」（复用现有 toast 视觉体系），
    //   展示壁纸预览大图 + 分类信息，用户点「确认使用」才真正设为背景。
    item.addEventListener('click', ()=>{
        _showBgConfirm(hostOrMask, {
            url:url, title:title,
            onConfirm: ()=>{
                _setBg(url);
                applyProfileToPage();
                const prevSel = '.hhkan-pp-bg-preview, #hhkan-uc-bg-preview, #hhkan-pp-bg-preview';
                const prev = document.querySelector(prevSel);
                if(prev){
                    prev.style.backgroundImage = `url('${url}')`;
                    prev.querySelector('.hhkan-pp-bg-tip')?.remove();
                }
                document.querySelectorAll('.hhkan-pp-bg-wall.hhkan-pp-ai-active').forEach(x=> x.classList.remove('hhkan-pp-ai-active'));
                item.classList.add('hhkan-pp-ai-active');
                addProfileHistory({ type:'bg', url:url, name:`「${title.replace(' · 随机壁纸','')}」壁纸`, catName:(title||'').replace(' · 随机壁纸','') });
                renderProfileHistory();
                renderProfileHistoryPanel(hostOrMask);
                // ★ 优先调用内嵌面板自己的 showUcToast（若在当前作用域内可用），
                //   否则回退到顶层通用弹窗函数，保证成功提示始终能弹出。
                if(typeof showUcToast === 'function'){
                    showUcToast({ icon:'🖼️', title:'背景图已更换', desc:`「${title.replace(' · 随机壁纸','')}」已同步到个人主页`, previewUrl:url });
                }else if(typeof showProfileToast === 'function'){
                    showProfileToast(hostOrMask, { icon:'🖼️', title:'背景图已更换', desc:`「${title.replace(' · 随机壁纸','')}」已同步到个人主页`, previewUrl:url });
                }
            }
        });
    });
    return item;
}

// ==================== 背景图「选中确认」精美弹窗（优化二）====================
// 点击壁纸卡片时弹出，展示壁纸预览大图 + 分类信息，确认后才设为背景。
// 复用现有 toast 的样式体系保持视觉统一，含预览大图 + 确认/取消双按钮 + 光环/粒子动画。
let _bgConfirmZ = 999990;
function _showBgConfirm(scope, opt){
    opt = opt || {};
    // 同一作用域内同时只保留一个确认弹窗
    const old = scope.querySelector('.hhkan-pp-bg-confirm');
    if(old) old.remove();
    const catName = (opt.title || '').replace(' · 随机壁纸','');
    const mask = document.createElement('div');
    mask.className = 'hhkan-pp-bg-confirm';
    mask.style.zIndex = String(++_bgConfirmZ);
    mask.innerHTML = `
      <div class="hhkan-pp-bg-confirm-box">
        <div class="hhkan-pp-bg-confirm-ring"></div>
        <div class="hhkan-pp-bg-confirm-ring2"></div>
        <div class="hhkan-pp-bg-confirm-burst"></div>
        <div class="hhkan-pp-bg-confirm-icon">🖼️</div>
        <div class="hhkan-pp-bg-confirm-title">确认使用这张壁纸？</div>
        <div class="hhkan-pp-bg-confirm-preview" style="background-image:url('${opt.url}')"></div>
        <div class="hhkan-pp-bg-confirm-desc">「${catName || '壁纸'}」即将设为你的个人主页背景，确认后即时生效。</div>
        <div class="hhkan-pp-bg-confirm-actions">
          <button class="hhkan-pp-bg-confirm-cancel" data-act="cancel">再看看</button>
          <button class="hhkan-pp-bg-confirm-ok" data-act="ok">✅ 确认使用</button>
        </div>
      </div>
    `;
    scope.appendChild(mask);

    const box = mask.querySelector('.hhkan-pp-bg-confirm-box');
    const close = ()=>{
        mask.classList.add('hhkan-pp-bg-confirm-hide');
        setTimeout(()=> mask.remove(), 240);
    };
    // 重置动画，保证重复点击也能重播
    [box, mask.querySelector('.hhkan-pp-bg-confirm-ring'), mask.querySelector('.hhkan-pp-bg-confirm-ring2'),
     mask.querySelector('.hhkan-pp-bg-confirm-burst'), mask.querySelector('.hhkan-pp-bg-confirm-icon')].forEach(el=>{
        if(!el) return;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
    });

    mask.addEventListener('click', (e)=>{ if(e.target === mask) close(); });
    mask.querySelectorAll('[data-act]').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            e.stopPropagation();
            if(btn.dataset.act === 'ok'){
                close();
                if(typeof opt.onConfirm === 'function') opt.onConfirm();
            }else{
                close();
            }
        });
    });
    const onKey = (e)=>{
        if(e.key === 'Escape'){ close(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

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
    // ★ 跟随自动切换：分类页 URL 基于当前最优镜像拼接
    const url = hhkanUrl(`/map/${catId}-${page}.html`);
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
                // ★ 跟随自动切换：详情页链接基于当前最优镜像
                fullUrl: hhkanUrl(`/movie/${id}.html`),
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
                    // ★ 跟随自动切换：详情页链接基于当前最优镜像
                    fullUrl: hhkanUrl(`/movie/${id}.html`),
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
    // ★ 跟随自动切换：搜索接口基于当前最优镜像
    const searchUrl = hhkanUrl(`/search.php?searchword=${encodeURIComponent(keyword)}`);
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
            // ★ 跟随自动切换：首页基于当前最优镜像
            xhr.open('GET', hhkanUrl('/'), true);
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
                                            // ★ 跟随自动切换：详情页链接基于当前最优镜像
                                            fullUrl: hhkanUrl(`/movie/${id}.html`),
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
            // ★ 跟随自动切换：搜索链接基于当前最优镜像
            fullUrl: hhkanUrl(`/search.php?searchword=${encodeURIComponent(title)}`),
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
// ==================== 【弹窗优先级管理模块】（优化版）开始 ====================
// ★ 全部功能弹窗统一注册，按优先级互斥：
//   数字越大 → 层级越高 → 越不容易被自动关闭
//
//   优先级顺序（由高到低）：
//     100  本地播放器（正在播放，最高优先，不应被关）
//      90  继续观看（观看历史，用户正在决策）
//      80  全局设置（系统级配置）
//      70  选集/线路弹窗
//      60  播放器设置
//      50  每日推荐
//      40  APP 下载（最次要，随时可被覆盖）
const MODAL_REGISTRY = [
    { id: 'local-player-mask',     priority: 100 }, // 本地播放器（正在播放，最高优先）
    { id: 'hhkan-continue-mask',   priority: 90  }, // ★ 继续观看
    { id: 'hhkan-enhance-settings',priority: 80  }, // ★ 全局设置
    { id: 'episode-modal-mask',    priority: 70  }, // 选集/线路弹窗
    { id: 'player-setting-mask',   priority: 60  }, // 播放器设置
    { id: 'recommend-modal-mask',  priority: 50  }, // 每日推荐

];
// 所有参与优先级管理的弹窗 id（去重，便于遍历）
const MODAL_IDS = MODAL_REGISTRY.map(m => m.id);

function getModalPriority(id){
    const m = MODAL_REGISTRY.find(x => x.id === id);
    return m ? m.priority : 0;
}
// 返回当前已打开弹窗中最高优先级的那条（null 表示无任何弹窗）
function getTopOpenModal(){
    let top = null;
    MODAL_REGISTRY.forEach(m => {
        if(document.querySelector('#' + m.id)){
            if(!top || m.priority > top.priority) top = m;
        }
    });
    return top;
}
// 返回当前已打开弹窗中最低优先级的那条（用于边界判断）
function getBottomOpenModal(){
    let bot = null;
    MODAL_REGISTRY.forEach(m => {
        if(document.querySelector('#' + m.id)){
            if(!bot || m.priority < bot.priority) bot = m;
        }
    });
    return bot;
}
// 判断指定弹窗当前是否已打开
function isModalOpen(id){
    return !!document.querySelector('#' + id);
}

/**
 * 关闭指定 id 的弹窗。
 * 优先调用其专属 close 函数 / 按钮（避免资源泄漏、定时器残留）；
 * 无专属 close 逻辑时直接 remove。
 */
function closeModalById(id){
    // ---- 每日推荐：走专属 close（清理海报抓取队列、定时器、恢复悬浮球）----
    if(id === 'recommend-modal-mask')      { try{ closeRecommendModal(); }catch(e){} return; }
    // ---- utorrent本地播放器：模拟点击关闭按钮（释放 video 资源）----
    if(id === 'local-player-mask'){
        const c = document.querySelector('#lp-btn-close');
        if(c){ try{ c.click(); }catch(e){} return; }
    }
    // ---- 全局设置：直接 remove（无异步资源）----
    if(id === 'hhkan-enhance-settings'){
        const mask = document.querySelector('#' + id);
        if(mask) mask.remove();
        return;
    }
    // ---- 继续观看：直接 remove（render 内部已做空态处理）----
    if(id === 'hhkan-continue-mask'){
        const mask = document.querySelector('#' + id);
        if(mask) mask.remove();
        return;
    }
    // ---- 其余弹窗（选集 / 播放设置 / APP）：无特殊资源，直接 remove ----
    const el = document.querySelector('#' + id);
    if(el) el.remove();
}

/**
 * ★ 打开新弹窗前的统一闸门（被各 openXxxModal 函数调用）。
 * 规则：
 *   1) 若已存在「优先级 >= 新弹窗」的弹窗 → 本次打开被抑制（保留高优先级弹窗）
 *   2) 否则 → 关闭所有已开的、优先级低于本次弹窗的弹窗，再允许打开
 */
function requestOpenModal(newId){
    const newPri = getModalPriority(newId);
    const top = getTopOpenModal();
    if(top && top.priority >= newPri && top.id !== newId){
        console.log('[弹窗优先级] 抑制打开', newId, '，当前高优先级弹窗:', top.id);
        return false;
    }
    // 关闭所有已开的、优先级低于本次的弹窗（"打开谁，关掉比它低的"）
    MODAL_REGISTRY.forEach(m => {
        if(m.id === newId) return;
        if(document.querySelector('#' + m.id) && m.priority < newPri){
            console.log('[弹窗优先级] 关闭低优先级弹窗:', m.id, '以打开', newId);
            closeModalById(m.id);
        }
    });
    return true;
}

/**
 * ★★★ "点击谁关闭上一级"核心逻辑 ★★★
 * 当用户点击（激活）某个已打开的弹窗时：
 *   - 关闭所有「优先级高于它」的弹窗（即"上一级/上几级"全部关闭）
 *   - 自己保留并置顶（z-index 提到最高）
 * 效果：点击哪个弹窗，哪个就到最前面，且不会再被上面的弹窗遮挡。
 */
function activateModal(id){
    const pri = getModalPriority(id);
    if(!pri) return;
    // 1) 关闭所有优先级高于本次的弹窗（"上一级"）
    MODAL_REGISTRY.forEach(m => {
        if(m.id === id) return;
        if(document.querySelector('#' + m.id) && m.priority > pri){
            console.log('[弹窗激活] 关闭上一级弹窗:', m.id, '-> 激活', id);
            closeModalById(m.id);
        }
    });
    // 2) 自己置顶：把 z-index 设为当前所有弹窗中的最大值 +1
    const el = document.querySelector('#' + id);
    if(el){
        el.style.zIndex = String(getTopZIndex() + 10);
    }
}
// 取当前页面中所有参与管理的弹窗的 z-index 最大值
function getTopZIndex(){
    let max = 0;
    MODAL_IDS.forEach(id => {
        const el = document.querySelector('#' + id);
        if(el){
            const z = parseInt(window.getComputedStyle(el).zIndex, 10);
            if(!isNaN(z) && z > max) max = z;
        }
    });
    return max;
}

/**
 * ★ 全局点击代理：监听对整个弹窗遮罩的点击，触发"激活置顶 + 关闭上一级"。
 * 绑定一次即可，自动适配未来新增的弹窗（只要 id 在 MODAL_REGISTRY 中）。
 * 绑定在 document 上，利用事件委托，不侵入各弹窗内部逻辑。
 */
function bindModalActivation(e){
    // 找到事件目标所属的、已注册的弹窗 mask
    const mask = MODAL_IDS
        .map(id => document.querySelector('#' + id))
        .find(el => el && el.contains(e.target));
    if(!mask) return;
    const id = mask.id;
    // 点击的是"关闭按钮 / 内部交互控件"时不触发激活（让原生 onclick 处理）
    if(e.target.closest('button, a, input, label, .ep-item, .rec-item, .hc-del, .hc-clearall')) return;
    activateModal(id);
}
// 是否已绑定（防止模块被重复执行时重复监听）
if(!window.__hhkan_modal_activation_bound){
    document.addEventListener('click', bindModalActivation, true);
    window.__hhkan_modal_activation_bound = true;
}

/**
 * ★ 工具：给弹窗的"点击遮罩背景关闭"逻辑打补丁——
 *   在原生 mask.onclick 基础上，额外执行 activateModal，
 *   保证"点背景"也走统一的"关闭上一级"语义。
 */
function patchMaskClick(id){
    const mask = document.querySelector('#' + id);
    if(!mask || mask.dataset.__patched === '1') return;
    mask.dataset.__patched = '1';
    const origHandler = mask.onclick;
    mask.onclick = function(e){
        activateModal(id);          // ★ 关闭上一级
        if(typeof origHandler === 'function'){
            return origHandler.call(this, e);
        }
    };
}
// ==================== 【弹窗优先级管理模块】（优化版）结束 ====================
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
 * ★ 切换当前影片窗口的全屏状态（全屏 <-> 退出全屏）
 * 供「M 键快捷键」与「全局设置说明」统一调用：
 *   - 若当前已是全屏 → 退出全屏（回到正常窗口）；
 *   - 若当前非全屏 → 对播放器容器请求进入全屏。
 * 优先对 video 父容器（DPlayer / xgplayer / 自定义播放器）全屏，兼容性最佳。
 */
function toggleFullscreen(){
    // 情况一：当前已是全屏状态 → 退出全屏
    if(getFullscreenElement()){
        const exitFs =
            document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.mozCancelFullScreen ||
            document.msExitFullscreen;
        if(exitFs){
            try{ exitFs.call(document); }catch(e){}
        }
        return;
    }
    // 情况二：当前非全屏 → 请求对播放器容器进入全屏
    requestFullscreenOnVideo();
}
/**
 * 尝试自动全屏（带重试机制，等待播放器渲染完成）
 */
function tryAutoFullscreen(maxRetries = 10, interval = 500){
    let retries = 0;
    const attempt = () => {
        // 检查是否需要自动全屏：
        // ① 选集跳转 / 线路切换 后留下的 sessionStorage 标志（高优先级，消费后清除）
        // ② 全局设置「影片自动放大全屏」开关（播放器内自动全屏）
        const sessionFlag = sessionStorage.getItem(AUTO_FS_KEY) === "1";
        let settingFlag = false;
        try{ settingFlag = !!getPlayerSettings().autoFullscreen; }catch(e){}
        if(!sessionFlag && !settingFlag){
            return;
        }
        const video = document.querySelector('video');
        if(video && video.readyState >= 1){
            // 视频已加载，尝试全屏
            const success = requestFullscreenOnVideo();
            if(success){
                console.log('[自动全屏] ✅ 已自动进入全屏模式');
                // 仅当由 sessionStorage 标志触发时才清除（保证「全局设置开启」时每次播放都全屏）
                if(sessionStorage.getItem(AUTO_FS_KEY) === "1"){
                    sessionStorage.removeItem(AUTO_FS_KEY);
                }
                return;
            }
        }
        // 重试
        retries++;
        if(retries < maxRetries){
            setTimeout(attempt, interval);
        }else{
            console.log('[自动全屏] ⚠️ 重试次数耗尽，放弃自动全屏');
            // 仅清除 sessionStorage 标志，全局设置开关由 settings 控制、不受此影响
            if(sessionStorage.getItem(AUTO_FS_KEY) === "1"){
                sessionStorage.removeItem(AUTO_FS_KEY);
            }
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
// ========== 画质识别（独立纯函数，供"按画质分组"复用）==========
// 从任意文本中识别出标准画质 key；命中即返回对应 key，均未命中返回 '线路分类'。
// 顺序即优先级：4K > 蓝光 > 高清(FHD/HD) > 720P > 标清，确保一条线路只归到一个画质类。
const QUALITY_ORDER = ['4K','蓝光','高清','720P','标清','线路分类'];
function detectQuality(text){
    const raw = (text || '').toString().trim();
    const lower = raw.toLowerCase();
    if(/\b4k\b|超清|秒播|4K/.test(raw)) return '4K';
    if(/蓝光|blue|bd\b|\bblue\s*ray\b/.test(lower)) return '蓝光';
    if(/\bhd\b|高清|fhd|清晰/.test(lower)) return '高清';
    if(/720p|480p/.test(lower)) return '720P';
    if(/标清|sd\b|流畅|普清/.test(lower)) return '标清';
    return '线路分类';
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
    // ★ v7：更严格识别「单集影片」，避免电视剧/动漫被误判为电影而丢失集数/更新检测
    const url = location.href.toLowerCase();
    if(/movie|film|单集/.test(url)) return true;
    const listSelectors = [
        '.module-play-list', '.play-list', '.episode-list', '.episode-list-box',
        '.anthology-list', '.num-list', '.play-box-list', '.video-list',
        '.ep-list', '.play-item-list', '.list-play', '.play-wrap'
    ];
    // ★ 只统计「带集数特征的真实集数链接」，避免非集数链接干扰计数
    let totalEps = 0, maxNum = 0;
    for(const sel of listSelectors){
        const lists = document.querySelectorAll(sel);
        lists.forEach(list => {
            list.querySelectorAll('a[href]').forEach(a => {
                const t = (a.textContent||'').trim();
                const n = (typeof parseEpisodeNumber==='function') ? parseEpisodeNumber(t) : 0;
                if(n > 0){ totalEps++; if(n > maxNum) maxNum = n; }
            });
        });
    }
    // ★ 存在「第2集」及以后 → 铁定是剧集（电影不可能有第2集）
    if(maxNum >= 2) return false;
    if(totalEps >= 2) return false;
    const pageText = document.body ? (document.body.innerText||'') : '';
    if(/选集|分集|剧集|连载|更新至|共\s*\d+\s*集/.test(pageText)) return false;
    if(/第\s*[\d一二三四五六七八九十]+\s*集/.test(pageText)) return false;
    if(totalEps <= 2 && totalEps > 0) return true;
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
        // ★ 按画质归并：给每条线路打上画质标签，再把相同画质的线路合并到同一分类组，
        //   做到"每个画质底下好好分类"——同一画质的所有线路/集数都归在该画质组下，不丢失任何线路。
        const groups = {};
        lines.forEach((line, gi) => {
            const quality = detectQuality(line.name);
            if(!groups[quality]) groups[quality] = [];
            groups[quality].push({ ...line, quality, subIndex: groups[quality].length });
        });
        // 按标准画质优先级排序（4K > 蓝光 > 高清 > 720P > 标清 > 线路分类）
        const orderedKeys = QUALITY_ORDER.filter(q => groups[q] && groups[q].length > 0);
        const merged = [];
        orderedKeys.forEach((q, gIdx) => {
            const subs = groups[q];
            if(subs.length === 1){
                // 单一线路：直接使用，name 保留原始画质命名
                merged.push({ ...subs[0], quality:q, groupIndex:gIdx, isGroup:false });
            }else{
                // 多条线路同画质：合并为一个"画质分类组"，组下保留全部子线路及其集数
                const allEps = [];
                subs.forEach((sub, si) => {
                    // 给每个集数标记所属子线路名，便于区分
                    sub.episodes.forEach(ep => {
                        allEps.push({ ...ep, __subName: sub.name, __subIndex: si });
                    });
                });
                merged.push({
                    name: q + '（' + subs.length + '条线路）',
                    quality: q,
                    groupIndex: gIdx,
                    isGroup: true,
                    subLines: subs,           // 原始各子线路（保留各自 name/episodes）
                    episodes: allEps,         // 合并后的全部集数（带所属线路标记）
                    total: allEps.length,
                    index: gIdx,
                    isMovie: true
                });
            }
        });
        return merged.length > 0 ? merged : lines;
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
    const decode = (s)=> (s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/"/g,'"').replace(/&#39;/g,"'");
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

// ==================== ★ 从当前最优镜像的对应影片详情页提取海报 ★ ====================
// 优先用当前 URL 中的影片 id 拼接详情页 URL 抓取，通过 parseDetailFromHtml 解析
// og:image / poster 图，并写入 poster_cache(键=影片标题)。
// ★ 适配 hhkan0~4 全部镜像：先打最优主站，失败自动逐个尝试其它候选，
//   海报相对路径按"所属镜像域"补全绝对地址，确保选集弹窗图片始终可用。
// 返回解析到的海报绝对 URL；全部失败返回 ''。
function fetchHhkanPoster(title, id){
    return new Promise(function(resolve){
        if(!id){ resolve(''); return; }
        // 依次尝试：当前最优主站 → 其它候选镜像（自动切换，哪个能取到海报用哪个）
        var candidates = [hhkanHost()];
        if(typeof getHhkanCandidates === 'function'){
            getHhkanCandidates().forEach(function(h){ var hs = _toHost(h); if(hs !== candidates[0]) candidates.push(hs); });
        }
        var tried = 0;
        function tryNext(){
            if(tried >= candidates.length){ resolve(''); return; }
            var base = candidates[tried++].replace(/\/+$/,'');
            var url = base + '/movie/' + encodeURIComponent(id) + '.html';
            try{
                var xhr = new XMLHttpRequest();
                xhr.timeout = 6000;
                xhr.open('GET', url, true);
                xhr.onload = function(){
                    if(xhr.status !== 200){ tryNext(); return; }
                    var d = parseDetailFromHtml(xhr.responseText);
                    var poster = d.poster || '';
                    if(poster && !/^https?:/i.test(poster)){
                        // ★ 相对路径按"所属镜像域"补全绝对地址（跟随自动切换）
                        poster = base + (poster.charAt(0)==='/' ? '' : '/') + poster;
                    }
                    if(!poster){ tryNext(); return; }
                    if(title){ setPosterCache(title, poster); }
                    resolve(poster);
                };
                xhr.onerror = function(){ tryNext(); };
                xhr.ontimeout = function(){ tryNext(); };
                xhr.send();
            }catch(e){ tryNext(); }
        }
        tryNext();
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
        // ★ 跟随自动切换：详情页基于当前最优镜像拼接
        const url = id ? hhkanUrl(`/movie/${id}.html`) : '';
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
// ========== ★ 功能一：记忆播放 —— 进入播放页自动弹出「继续观看」提示条 ==========
// 命中条件：本影片存在观看历史 && 进度 < 95%（视为未看完）&& 不是首次进来直接播完
// 优先级低于开屏动画/更新公告，且本会话已忽略过则不再打扰
function checkAutoResume(){
    try{
        if(!hasVideoElement()) return;                    // 仅在播放页生效
        if(sessionStorage.getItem('hhkan_resume_dismissed') === '1') return; // 本次已忽略
        const cur = (typeof currentMovieKey==='function') ? currentMovieKey() : '';
        if(!cur) return;
        const hist = (typeof loadHistory==='function') ? loadHistory() : [];
        const item = hist.find(h => h.key === cur);
        if(!item) return;
        // 已看完（≥95%）或进度为 0 的不提示
        if(!item.percent || item.percent >= 95 || item.currentTime < 5) return;
        showResumeBar(item);
    }catch(e){ console.warn('[继续观看] 检测异常：', e); }
}
// 悬浮在播放器上方的「继续观看」提示条：显示进度 + 一键续播 + 忽略
function showResumeBar(item){
    if(document.querySelector('#hhkan-resume-bar')) return;
    const ep = parseInt(item.ep) || 0;
    const pct = parseInt(item.percent) || 0;
    const title = (item.title || '').replace(/<[^>]+>/g,'').slice(0, 30);
    const total = parseInt(item.total) || 0;
    const kind = item.kind || (total > 1 ? 'series' : 'movie');
    // ★ v7：电影/单集只显示影片名 + 进度，不拼接「第X集/共Y」
    const epPart = (kind === 'series' && ep > 0) ? (' · 第'+ep+'集'+(total ? '/'+total : '')) : '';
    const bar = document.createElement('div');
    bar.id = 'hhkan-resume-bar';
    bar.innerHTML = `
        <span class="hr-icon">⏯️</span>
        <span class="hr-text">继续观看 <b>${title||'上次影片'}</b>${epPart}（看到 ${pct}%）</span>
        <button type="button" class="hr-resume" id="hr-resume-btn">▶ 继续</button>
        <button type="button" class="hr-from-start" id="hr-start-btn" title="从头开始">从头</button>
        <button type="button" class="hr-close" id="hr-close-btn" title="本次不再提示">✕</button>
    `;
    const fsEl = (typeof getFullscreenElement==='function') ? getFullscreenElement() : null;
    if(fsEl) fsEl.appendChild(bar); else document.body.appendChild(bar);
    // 触发入场动画
    void bar.offsetWidth; bar.classList.add('hr-show');
    const dismiss = (remember)=>{
        bar.classList.remove('hr-show');
        if(remember) sessionStorage.setItem('hhkan_resume_dismissed','1');
        setTimeout(()=>bar.remove(), 300);
    };
    bar.querySelector('#hr-close-btn').onclick = ()=> dismiss(true);
    bar.querySelector('#hr-start-btn').onclick = ()=>{
        // 从头开始：seek 到 0（若当前就是本影片视频，直接 seek）
        const v = document.querySelector('video');
        if(v){ try{ v.currentTime = 1; }catch(e){} }
        dismiss(false);
    };
    bar.querySelector('#hr-resume-btn').onclick = ()=>{
        const v = document.querySelector('video');
        if(v && isFinite(v.duration) && item.currentTime < v.duration){
            try{ v.currentTime = item.currentTime; v.play().catch(()=>{}); }catch(e){}
        }else if(item.url && item.url !== location.href){
            // 跨影片：跳转过去后由该页自动恢复进度
            location.href = item.url; return;
        }
        dismiss(false);
    };
    // 12 秒自动收起（不记住，下次仍提示）
    clearTimeout(bar._timer);
    bar._timer = setTimeout(()=> dismiss(false), 12000);
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
// ========== ★ 功能二：选集线路速度探测（HEAD 探测，超时 3s，🟢🟡🔴 标记）==========
// 对每条线路的「第一个集数 URL」发 HEAD 请求，按响应耗时打标记：
//   🟢 <500ms 快  |  🟡 <2000ms 一般  |  🔴 ≥2000ms 慢 / 超时(3s)
// 结果缓存到 line.tab（DOM），并在 tab 名称后追加延迟徽标；同域跨域均做容错降级。
const LINE_PROBE_KEY = 'hhkan_line_probe';
const PROBE_TIMEOUT = 3000;
// 取线路的探测 URL：优先第一条集数，其次线路自身的 url
function getProbeUrl(line){
    if(line && Array.isArray(line.episodes) && line.episodes.length > 0){
        const ep = line.episodes.find(e => e && e.url) || line.episodes[0];
        if(ep && ep.url) return ep.url;
    }
    return line && line.url ? line.url : '';
}
// 单次 HEAD 探测：返回耗时毫秒（超时/失败返回 PROBE_TIMEOUT 表示"慢"）
function probeOneUrl(url){
    return new Promise((resolve)=>{
        if(!url){ resolve(PROBE_TIMEOUT); return; }
        let done = false;
        const finish = (ms)=>{ if(!done){ done = true; resolve(ms); } };
        const timer = setTimeout(()=> finish(PROBE_TIMEOUT), PROBE_TIMEOUT);
        try{
            const xhr = new XMLHttpRequest();
            xhr.open('HEAD', url, true);
            xhr.timeout = PROBE_TIMEOUT;
            const start = Date.now();
            xhr.onload = ()=>{ clearTimeout(timer); finish(Math.min(Date.now()-start, PROBE_TIMEOUT)); };
            xhr.onerror = ()=>{ clearTimeout(timer); finish(PROBE_TIMEOUT); };
            xhr.ontimeout = ()=>{ clearTimeout(timer); finish(PROBE_TIMEOUT); };
            xhr.send();
        }catch(e){
            clearTimeout(timer); finish(PROBE_TIMEOUT);
        }
    });
}
// 耗时 -> 标记
function probeBadge(ms){
    if(ms == null) return '<i class="lp-dot lp-unknown" title="未探测">⚪</i>';
    if(ms < 500)   return `<i class="lp-dot lp-fast" title="响应 ${ms}ms（快）">🟢${ms}</i>`;
    if(ms < 2000)  return `<i class="lp-dot lp-mid" title="响应 ${ms}ms（一般）">🟡${ms}</i>`;
    return `<i class="lp-dot lp-slow" title="响应 ${ms}ms / 超时（慢）">🔴${ms}</i>`;
}
// 探测所有线路，并把结果写进对应 .ep-line-tab 的徽标
function probeAllLines(mask, lines){
    if(!mask || !Array.isArray(lines) || lines.length < 2) return; // 单线路无需探测
    const tabs = mask.querySelectorAll('.ep-line-tab');
    const header = mask.querySelector('.ep-header');
    // 顶部状态提示
    let statusEl = mask.querySelector('.ep-probe-status');
    if(!statusEl){
        statusEl = document.createElement('div');
        statusEl.className = 'ep-probe-status';
        if(header) header.appendChild(statusEl);
    }
    const setStatus = (t)=>{ if(statusEl) statusEl.textContent = t; };
    setStatus('🔍 正在探测各线路速度…');
    // 并发探测（浏览器对同域并发有限制，但 HEAD 请求体小，可接受）
    Promise.all(lines.map((line, idx)=>{
        const url = getProbeUrl(line);
        return probeOneUrl(url).then(ms => ({ idx, ms }));
    })).then(results => {
        // 找出最快线路
        let bestIdx = -1, bestMs = Infinity;
        results.forEach(r => {
            if(r.ms < bestMs){ bestMs = r.ms; bestIdx = r.idx; }
            const tab = tabs[r.idx];
            if(tab){
                let badge = tab.querySelector('.ep-probe-badge');
                if(!badge){
                    badge = document.createElement('span');
                    badge.className = 'ep-probe-badge';
                    tab.appendChild(badge);
                }
                badge.innerHTML = probeBadge(r.ms);
            }
        });
        // 记录最优线路到选择记录，供「错误源自动切换」复用
        try{
            const rec = JSON.parse(localStorage.getItem(LINE_PROBE_KEY) || '{}');
            rec.bestIdx = bestMs < PROBE_TIMEOUT ? bestIdx : -1;
            rec.bestMs = bestMs < PROBE_TIMEOUT ? bestMs : null;
            rec.details = results.reduce((o,r)=>{ o[r.idx] = r.ms; return o; }, {});
            localStorage.setItem(LINE_PROBE_KEY, JSON.stringify(rec));
        }catch(e){}
        setStatus(bestIdx >= 0 ? `✅ 探测完成，最快：${lines[bestIdx].name}（${bestMs}ms）` : '⚠️ 探测完成，未发现明显更快的线路');
        setTimeout(()=>{ if(statusEl && statusEl.textContent.indexOf('探测完成')>=0) statusEl.textContent=''; }, 5000);
        // ★ 自动高亮推荐：给最快线路的 tab 加推荐样式
        if(bestIdx >= 0 && tabs[bestIdx]) tabs[bestIdx].classList.add('ep-line-best');
    }).catch(()=> setStatus('⚠️ 探测失败'));
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
    // ★【小优化一】以"当前实际播放的路径"为准，校准激活线路：
    //   我用哪个路径(线路)在播放，打开选集时顶部栏就自动定位到该线路的按钮。
    //   detectCurrentPlay 基于当前 URL 精确匹配各线路的集数，比 record 更贴近"正在播"的真实状态。
    try{
        const playing = (typeof detectCurrentPlay==='function') ? detectCurrentPlay() : null;
        if(playing && playing.found && typeof playing.lineIndex==='number'
           && playing.lineIndex >= 0 && playing.lineIndex < lines.length){
            activeIdx = playing.lineIndex;
            // 同步更新选择记录，保证下方"上次：线路X · 第N集"信息条与当前一致
            saveSelectRecord({ lineIndex: playing.lineIndex, lineName: playing.lineName });
        }
    }catch(e){}
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
        ? `<img class="ep-movie-poster-img" id="ep-movie-poster-img" src="${_syncPoster.replace(/"/g,'"')}" alt="海报">`
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
    // ★ 为每条线路预计算画质色标 class（用于线路 tab 左侧色点）
    const lineQualityClass = lines.map(line => {
        const q = (line.quality || line.name || '').toUpperCase();
        if(q.indexOf('4K') >= 0) return 'q-4k';
        if(q.indexOf('蓝光') >= 0) return 'q-bd';
        if(q.indexOf('高清') >= 0 || q.indexOf('FHD') >= 0 || q.indexOf('HD') >= 0) return 'q-hd';
        if(q.indexOf('720') >= 0) return 'q-720';
        if(q.indexOf('标清') >= 0 || q.indexOf('SD') >= 0) return 'q-sd';
        return 'q-def';
    });
    let html = `<div id="episode-modal-box">
        <!-- ★ 顶部：标题栏 + 计数 + 排序 + 关闭 -->
        <div class="ep-header">
            <span class="ep-title">${isMovie ? '🎬 播放线路' : '📋 选集列表'}</span>
            <span class="ep-count">共 <b>${totalEps}</b> 集 · ${lines.length} 条线路</span>
            <span class="ep-spacer"></span>
            <button class="ep-order-btn" id="ep-order-btn" type="button" title="点击切换正序/倒序排列">${_orderLabel}</button>
            <button class="ep-close" id="ep-close-btn" type="button" title="关闭">✕</button>
        </div>
        <!-- ★ 影片信息卡：海报 + 标题 + 年份/类型 + 简介 -->
        <div class="ep-movie-card" id="ep-movie-card">
            <div class="ep-movie-poster" id="ep-movie-poster">${_posterHtml}</div>
            <div class="ep-movie-meta">
                <div class="ep-movie-title" id="ep-movie-title" title="${_dispTitle.replace(/"/g,'"')}">${_dispTitle} <span class="ep-movie-year" id="ep-movie-year">${_dispYear}</span> ${_genreHtml}</div>
                <div class="ep-movie-intro${_introLong}" id="ep-movie-intro">${_dispIntro}</div>
                <button class="ep-intro-toggle" id="ep-intro-toggle" type="button">展开 ▾</button>
            </div>
        </div>
        <!-- ★ 当前站点 + 上次选择记录条 -->
        <div class="ep-info-bar">
            <div class="ep-current-info">🌐 ${currentDomain}<span class="ep-cur-path">${currentUrl.replace(location.origin,'')}</span></div>
            <div class="ep-record-info" id="ep-record-bar">📌 上次：<span id="ep-record-text">${record.lineName||'未选择'}${record.episodeNum>0?' · 第'+record.episodeNum+'集':''}</span></div>
        </div>
        <!-- ★ 探测状态条（JS 动态写入"🔍探测中…/✅完成"） -->
        <div class="ep-probe-status" id="ep-probe-status"></div>`;
    // ★ 线路 tab 列表：每条带画质色点 + 集数 + 探测徽标（徽标由 probeAllLines 动态注入）
    if(lines.length > 1){
        html += `<div class="ep-line-tabs">`;
        lines.forEach((line, idx) => {
            const active = idx === activeIdx ? 'ep-line-active' : '';
            const qcls = lineQualityClass[idx] || 'q-def';
            html += `<div class="ep-line-tab ${active} ${qcls}" data-idx="${idx}" title="${line.name} · 点击切换">
                        <span class="ep-tab-dot"></span>
                        <span class="ep-tab-name">${line.name}</span>
                        <small>(${line.total})</small>
                     </div>`;
        });
        html += `</div>`;
    }
    // ★ 线路面板区：电影画质分组 / 普通线路，结构与原版完全一致，仅 class 语义增强
    lines.forEach((line, idx) => {
        const hidden = idx !== activeIdx && lines.length > 1 ? 'style="display:none"' : '';
        // ★ 电影 + 画质分组：画质大标题带左侧色条，组内各子线路以紧凑分节卡片呈现
        if(isMovie && line.isGroup && line.subLines && line.subLines.length > 0){
            const qcls = lineQualityClass[idx] || 'q-def';
            html += `<div class="ep-line-panel ep-group-panel ${qcls}" data-idx="${idx}" ${hidden}>
                <div class="ep-line-info ep-group-title">
                    <span class="ep-group-quality">${line.quality}</span>
                    <span class="ep-group-meta">${line.subLines.length} 条线路 · ${line.total} 个源</span>
                </div>`;
            line.subLines.forEach((sub, si) => {
                html += `<div class="ep-sub-line">
                    <div class="ep-sub-line-info"><span class="ep-sub-dot"></span>${sub.name}<small>（${sub.total}）</small></div>
                    <div class="ep-grid">`;
                sub.episodes.forEach((ep, epIdx) => {
                    const isLastSelected = (idx === record.lineIndex && ep.num === record.episodeNum) ? 'ep-selected' : '';
                    const urlPath = ep.url.replace(location.origin, '').split('?')[0];
                    const btnText = (sub.total > 1) ? (ep.text || ('第'+(epIdx+1)+'集')) : '▶ 播放';
                    html += `<a class="ep-item ${isLastSelected}" href="${ep.url}" title="点击跳转：${urlPath}" data-num="${ep.num}" data-line="${idx}" data-sub="${si}">${btnText}</a>`;
                });
                html += `</div></div>`;
            });
            html += `</div>`;
        }else{
            html += `<div class="ep-line-panel" data-idx="${idx}" ${hidden}>
                <div class="ep-line-info">${line.name}<small> · ${line.total} 集</small></div>
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
        }
    });
    html += `<div class="ep-footer">💡 ${isMovie ? '电影：按画质分类，每组下再分播放线路，点击切换源' : '点击线路切换 · 点击选集跳转 · 悬浮球可拖动'} · ${currentDomain}</div></div>`;
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
            var imgTag = '<img class="ep-movie-poster-img" src="' + posterToUse.replace(/"/g,'"') + '" alt="海报">';
            // 若缓存未命中，则现场抓取 hhkan0 详情页补充
            if(!posterFromHhkan){
                fetchHhkanPoster((getMovieTitle()||'').trim(), getCurrentMovieId()).then(function(u){
                    if(u){ pEl.innerHTML = '<img class="ep-movie-poster-img" src="' + u.replace(/"/g,'"') + '" alt="海报">'; }
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

    /* ========== ★ 功能二：选集弹窗打开即探测各线路速度（HEAD，超时 3s）==========
       结果以 🟢🟡🔴 徽标标注在每条线路 tab 上，并标记最快线路为「推荐」 */
    setTimeout(()=> probeAllLines(mask, lines), 150);

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
    // ★【小优化一】顶部线路 tab 栏自动滚动到"当前正在播放的线路"按钮：
    //   我用什么路径播放，打开选集时上面那排 .ep-line-tabs 就自动把该线路的按钮滚到视野中，
    //   并短暂高亮，一眼就能看出"现在播的是这条"。
    const scrollActiveLineTabIntoView = () => {
        const tabsHost = mask.querySelector('.ep-line-tabs');
        if(!tabsHost) return;
        const activeTab = tabsHost.querySelector('.ep-line-tab.ep-line-active') || tabsHost.querySelector(`.ep-line-tab[data-idx="${activeIdx}"]`);
        if(!activeTab) return;
        // 横向滚动容器，将激活 tab 居左并留一点余量，使其完整可见
        const tabRect = activeTab.getBoundingClientRect();
        const hostRect = tabsHost.getBoundingClientRect();
        if(tabRect.width === 0) return; // 尚未布局完成则跳过（靠重试兜底）
        const tabLeftRel = activeTab.offsetLeft; // 相对滚动容器的左侧偏移
        const desiredScroll = tabLeftRel - 16;   // 16px 留白
        // 仅在目标 tab 不在可视区内时才滚动（已可见则不抖动）
        const visibleLeft = tabsHost.scrollLeft;
        const visibleRight = tabsHost.scrollLeft + hostRect.width;
        if(tabLeftRel < visibleLeft || (tabLeftRel + tabRect.width) > visibleRight){
            tabsHost.scrollTo({ left: Math.max(0, desiredScroll), behavior:'smooth' });
        }
        // 短暂高亮当前线路按钮，强化"这就是现在播的"的视觉反馈
        activeTab.classList.add('ep-tab-playing-hint');
        clearTimeout(activeTab._playingHintTimer);
        activeTab._playingHintTimer = setTimeout(()=>{
            activeTab.classList.remove('ep-tab-playing-hint');
        }, 2000);
    };
    // 弹窗渲染完成后执行滚动（等待面板/集数按钮就绪）
    setTimeout(scrollToCurrentEp, 120);
    // ★ 渲染完成 + 线路探测徽标注入后，各执行一次定位，确保无论哪种时机都能对准当前线路
    setTimeout(scrollActiveLineTabIntoView, 120);
    setTimeout(scrollActiveLineTabIntoView, 600);
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
/* ★ 绝对置顶：z-index 取最大值，并强制独立层叠上下文（isolation），
   防止页面其它元素（顶部栏/悬浮球等）因父级 transform 等创建独立层叠上下文而盖过遮罩 */
#hhkan-splash-mask{
    position:fixed;inset:0;z-index:2147483647;
    isolation:isolate;transform:translateZ(0);will-change:opacity;
    display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#0f0c29 0%,#302b63 45%,#24243e 100%);
    overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    transition:opacity .65s ease;
}
/* ★ 遮住一切：动画进行中拦截所有下层点击/滚动/选中等交互，杜绝"露出的元素可被操作" */
#hhkan-splash-mask{user-select:none;-webkit-user-select:none;touch-action:none;}
#hhkan-splash-mask.splash-fadeout{opacity:0;pointer-events:none;}
/* ★ 隐藏滚动条：动画期间遮罩满屏铺底，任何滚动条（含 Webkit 自定义滚动条）都不应露出来 */
#hhkan-splash-mask::-webkit-scrollbar{width:0;height:0;display:none;}
html.hhkan-splash-active::-webkit-scrollbar,
html.hhkan-splash-active *::-webkit-scrollbar{width:0;height:0;display:none;}
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
/* ★ 任务栏分组：按钮按 导航 / 功能 / 系统 三组排列，组间用分隔线隔开，方便用户快速定位 */
#pake-window-top-bar .tb-group{
    display:flex;
    align-items:center;
    gap:6px;
}
/* 组间分隔线：仅在两组之间插入一条竖线，视觉上划清功能区 */
#pake-window-top-bar .tb-group + .tb-group{
    position:relative;
    padding-left:12px;
    margin-left:6px;
}
#pake-window-top-bar .tb-group + .tb-group::before{
    content:'';
    position:absolute;
    left:0; top:50%;
    transform:translateY(-50%);
    width:1px; height:16px;
    background:rgba(255,255,255,0.18);
}
/* 系统组（更新公告 / 删除APP）靠右贴边，与左侧功能组自然拉开距离 */
#pake-window-top-bar .tb-sys{
    margin-left:auto;
}
/* 删除APP按钮用红色，突出"危险操作"语义 */
#pake-window-top-bar #btn-delapp{
    color:#ffb3b3;
}
#pake-window-top-bar #btn-delapp:hover{
    background:#b03a2e;
    color:#fff;
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
/* ========== 更新公告弹窗 ========== */
#pake-disclaimer-mask{
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.78);
    z-index:999999999;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:16px;
    box-sizing:border-box;
}
#pake-disclaimer-box{
    position:relative;
    width:500px;
    max-width:100%;
    max-height:86vh;
    /* ★ 关键：四段 flex 布局 —— 头 / 滚动列表 / 声明 / 按钮，footer 永远在底部右下角 */
    display:flex;
    flex-direction:column;
    background:#202026;
    border-radius:14px;
    padding:0;
    box-shadow:0 16px 56px rgba(0,0,0,0.5);
    animation: noticePopIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes noticePopIn{
    from{ opacity:0; transform:translateY(24px) scale(0.96); }
    to  { opacity:1; transform:translateY(0) scale(1); }
}
/* 标题栏：标题 + 版本号（左右两端对齐） */
.notice-head{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
    padding:22px 24px 14px 24px;
    border-bottom:1px solid rgba(255,255,255,0.07);
    flex-shrink:0;
}
.notice-head-left{
    display:flex;
    flex-direction:column;
    gap:6px;
    min-width:0;
}
#pake-disclaimer-box h3{
    color:#ffffff;
    margin:0;
    font-size:18px;
    line-height:1.3;
}
/* 版本副标题（带渐变高亮 + 左侧竖条，突出本次版本） */
.notice-sub{
    margin:0;
    background:linear-gradient(135deg, rgba(255,122,89,0.15), rgba(255,61,127,0.15));
    border-left:3px solid #ff7a59;
    padding:8px 12px;
    border-radius:0 6px 6px 0;
    font-size:12.5px;
    color:#e8e8e8;
    line-height:1.6;
}
.notice-head .notice-ver{
    flex-shrink:0;
    font-size:12px;
    font-weight:bold;
    color:#fff;
    background:linear-gradient(135deg,#ff7a59,#ff3d7f);
    padding:4px 11px;
    border-radius:20px;
    letter-spacing:0.5px;
}
/* 更新内容：可滚动区域（功能多了自动出现下拉滚动条） */
.notice-scroll{
    flex:1 1 auto;
    min-height:0;               /* 允许收缩，保证 max-height 生效、不把 footer/按钮挤出弹窗 */
    max-height:44vh;
    overflow-y:auto;
    padding:8px 24px;
    scrollbar-width:thin;
    scrollbar-color:rgba(255,122,89,0.6) transparent;
}
.notice-scroll::-webkit-scrollbar{ width:6px; }
.notice-scroll::-webkit-scrollbar-thumb{
    background:rgba(255,122,89,0.6);
    border-radius:3px;
}
.notice-scroll::-webkit-scrollbar-track{ background:transparent; }
.notice-changelog{
    list-style:none;
    padding:0;
    margin:0;
    counter-reset:none;
}
/* ★ 每条：序号 + 彩色标签 + 正文，按 1、2、3… 竖列排序 */
.notice-changelog li{
    display:flex;
    align-items:flex-start;
    gap:10px;
    padding:11px 0;
    border-bottom:1px solid rgba(255,255,255,0.06);
}
.notice-changelog li:last-child{ border-bottom:none; }
/* 序号圆点 1、2、3… */
.notice-num{
    flex-shrink:0;
    width:22px; height:22px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:rgba(255,122,89,0.16);
    color:#ff9a7a;
    border-radius:50%;
    font-size:11.5px;
    font-weight:bold;
    line-height:1;
    margin-top:1px;
}
/* 彩色标签（新增 / 优化 / 修复） */
.notice-tag{
    flex-shrink:0;
    font-size:11px;
    font-weight:bold;
    padding:3px 8px;
    border-radius:5px;
    line-height:1.5;
    white-space:nowrap;
    margin-top:1px;
}
.notice-tag-新增{ background:rgba(46,204,113,0.18); color:#2ecc71; }
.notice-tag-优化{ background:rgba(52,152,219,0.18); color:#5dade2; }
.notice-tag-修复{ background:rgba(231,76,60,0.18);  color:#ec7063; }
.notice-text{
    flex:1;
    min-width:0;
    color:#e2e2e2;
    font-size:13px;
    line-height:1.65;
}
/* ★ 声明文字：永远固定在弹窗右下角 —— 用 flex 自动贴底 + text-align:right，
   无论列表多长 / 是否滚动，都稳定显示在右下角，绝不随内容被顶走 */
.notice-foot{
    flex-shrink:0;
    text-align:right;
    color:#9a9a9a;
    font-size:11.5px;
    line-height:1.6;
    padding:10px 24px 4px 24px;
    pointer-events:none;        /* 纯展示，不遮挡按钮点击 */
}
#pake-btn-confirm{
    display:block;
    width:calc(100% - 48px);
    margin:2px 24px 20px 24px;
    padding:11px;
    background:linear-gradient(135deg,#ff7a59,#ff3d7f);
    color:#fff;
    border:none;
    border-radius:8px;
    font-size:14px;
    font-weight:bold;
    cursor:pointer;
    transition:opacity 0.2s;
}
#pake-btn-confirm:hover{
    opacity:0.88;
}
/* ========== 播放器设置弹窗（抽屉式：画面调节收入抽屉，避免 UI 过长）========== */
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
    width:356px;               /* ★ 收窄宽度，去掉底部按钮后更紧凑协调 */
    max-width:90vw;
    padding:22px 22px 20px;    /* ★ 底部收紧，去除按钮占位带来的多余留白 */
    border-radius:14px;
    box-shadow:0 12px 48px rgba(0,0,0,0.4);
    animation: psBoxSlideLeftAnim 0.35s cubic-bezier(0.22, 1.36, 1) forwards;
    margin-left:auto;
    position:relative;
    max-height:calc(100vh - 96px);    /* ★ 内容过多可滚动，收口更贴合视口 */
    overflow-y:auto;
    overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
}
/* ★ 【BUG 五修复】窗口变窄时自适应：弹窗收窄到可用宽度、内边距与字号联动缩小，
   保证画面比例按钮组 / Tab / 滑块 / 预设按钮全部露出来、不横向溢出。 */
@media (max-width:480px){
    #player-setting-mask{
        padding:64px 10px 10px 10px;
        align-items:flex-start;
        justify-content:center;
    }
    #player-setting-box{
        width:100%;
        max-width:100%;
        padding:14px 13px 14px;
        max-height:calc(100vh - 74px);
        border-radius:12px;
    }
    #player-setting-box h3{ font-size:15px; margin-bottom:10px; }
    .setting-group{ margin-bottom:10px; padding-bottom:9px; }
    .setting-group label{ font-size:12.5px; margin-bottom:5px; }
    .setting-desc{ font-size:11px; margin-bottom:9px; }
    .fit-buttons{ gap:4px; }
    .fit-buttons button{ padding:3px 7px; font-size:11.5px; flex:1 1 auto; }
    .ps-tabs{ margin-bottom:10px; }
    .ps-tab{ font-size:12px; padding:6px 4px; }
    .cp-tabs{ gap:4px; }
    .filter-preset-btn{ padding:0 4px; width:100%; height:38px; font-size:12px; flex:0 0 auto; text-align:center; line-height:1; box-sizing:border-box; gap:5px; }
    .filter-presets{ gap:8px; }
    #ps-tab-filter .filter-presets{ grid-template-columns:repeat(3, 1fr); }
    #ps-tab-filter #filter-presets-builtin,
    #ps-tab-filter #filter-presets-custom{ grid-template-columns:repeat(3, 1fr); }
    .custom-preset-box{ padding:10px 11px; }
    .cp-batch-actions{ gap:6px; flex-wrap:wrap; }
    .cp-action-btn{ flex:1 1 auto; text-align:center; font-size:11.5px; padding:5px 6px; }
    .cp-save-btn{ width:100%; padding:8px; font-size:12.5px; }
    .setting-group input[type="range"]{ width:100%; }
    .ps-reset-btn{ width:100%; margin-top:8px; }
    .cp-title{ font-size:12.5px; }
    .cp-name{ font-size:12px; }
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
    margin:0 0 14px 0;
    font-size:17px;
    color:#222;
}
.setting-group{
    margin-bottom:15px;
    padding-bottom:13px;
    border-bottom:1px solid #ececec;  /* ★ 每个功能组底部加下划线分隔线，视觉更清爽 */
}
.setting-group:last-of-type{
    border-bottom:none;  /* 最后一个功能组不再需要分隔线（底部已无保存按钮） */
    margin-bottom:2px;
}
.setting-group label{
    display:block;
    font-size:13.5px;
    color:#333;
    margin-bottom:7px;
    font-weight:bold;
}
.fit-buttons{
    display:flex;
    gap:6px;
    flex-wrap:wrap;
}
.fit-buttons button{
    padding:4px 10px;
    border:1px solid #ddd;
    background:#f5f5f5;
    border-radius:6px;
    cursor:pointer;
    font-size:12.5px;
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
.setting-group label .setting-val{
    float:right;
    font-weight:normal;
    font-size:12px;
    color:#5b4bff;
}
.setting-desc{
    font-size:11.5px;
    color:#999;
    margin-bottom:14px;
    line-height:1.55;
}
/* ---- ★ 恢复默认亮度按钮（BUG 三：亮度组右侧操作按钮）---- */
.ps-reset-btn{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:4px;
    margin-top:10px;
    padding:5px 12px;
    font-size:12px;
    font-weight:600;
    color:#fff;
    background:linear-gradient(135deg,#5b4bff,#a29bfe);
    border:none;
    border-radius:7px;
    cursor:pointer;
    transition:filter .15s, transform .15s;
}
.ps-reset-btn:hover{ filter:brightness(1.12); }
.ps-reset-btn:active{ transform:scale(.96); }
/* ---- ★ 播放器设置：Tab 选择夹分类（常规 / 画面调节）---- */
.ps-tabs{
    display:flex;
    gap:6px;
    background:#f2f2f7;
    border-radius:10px;
    padding:4px;
    margin-bottom:15px;
}
.ps-tab{
    flex:1;
    text-align:center;
    padding:7px 6px;
    font-size:12.5px;
    font-weight:bold;
    color:#666;
    border-radius:7px;
    cursor:pointer;
    user-select:none;
    transition:all 0.2s;
    white-space:nowrap;
}
.ps-tab:hover{
    color:#333;
    background:rgba(91,75,255,0.06);
}
.ps-tab.ps-tab-active{
    background:#fff;
    color:#5b4bff;
    box-shadow:0 2px 8px rgba(91,75,255,0.16);
}
/* 每个 Tab 对应的内容面板：默认隐藏，激活时显示 */
.ps-tab-panel{
    display:none;
}
.ps-tab-panel.ps-tab-panel-active{
    display:block;
}
/* 画面调节页的字段样式微调（与抽屉内保持一致观感） */
#ps-tab-filter .filter-field{
    margin-bottom:11px;
}
#ps-tab-filter .filter-field label{
    display:block;
    font-size:12.5px;
    color:#333;
    margin-bottom:5px;
    font-weight:bold;
}
#ps-tab-filter .filter-field input[type="range"]{
    width:100%;
    accent-color:#5b4bff;
}
#ps-tab-filter .filter-presets-label{
    font-size:12px;
    color:#666;
    margin:5px 0 8px 0;
    font-weight:bold;
}
#ps-tab-filter .filter-presets{
    display:grid;
    /* ★ 固定每列 116px，一行三个；9 个内置预设正好排 3 行 */
    grid-template-columns:repeat(3, 116px);
    gap:10px;
    margin-bottom:14px;
    justify-content:flex-start;
}
/* 自定义预设也固定 3 列，按钮尺寸与内置预设保持一致 */
#ps-tab-filter #filter-presets-builtin,
#ps-tab-filter #filter-presets-custom{
    grid-template-columns:repeat(3, 116px);
}
#ps-tab-filter .filter-preset-btn{
    display:flex;
    flex-direction:row;             /* ★ 图标与文字横向排一行 */
    align-items:center;
    justify-content:center;
    gap:6px;
    width:116px;                    /* ★ 固定宽 */
    height:38px;                    /* ★ 固定高（放大后更饱满） */
    padding:0 6px;                  /* 固定尺寸后内边距会让内容溢出 */
    border:1px solid #e2e2ea;
    background:#fff;
    border-radius:10px;
    cursor:pointer;
    font-size:13px;                 /* ★ 文字放大 */
    line-height:1;
    color:#333;
    box-sizing:border-box;          /* 边框计入 38px，否则实际 40px */
    transition:all 0.2s;
}
#ps-tab-filter .filter-preset-btn span{
    font-size:13px;                 /* ★ 与按钮字号统一 */
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
    max-width:64px;                 /* 防"高清写实"等长名挤出按钮 */
}
#ps-tab-filter .filter-preset-btn:hover{
    border-color:#5b4bff;
    color:#5b4bff;
    background:#f5f3ff;             /* ★ hover 微提亮，反馈更明确 */
    transform:translateY(-1px);     /* ★ 轻微上浮 */
    box-shadow:0 3px 8px rgba(91,75,255,0.15);
}
#ps-tab-filter .filter-preset-btn.preset-active{
    background:#5b4bff;
    border-color:#5b4bff;
    color:#fff;
    box-shadow:0 3px 10px rgba(91,75,255,0.35);   /* ★ 选中态带光晕 */
}
#ps-tab-filter .filter-drawer-tip{
    font-size:11.5px;
    color:#999;
    line-height:1.5;
}
/* ---- ★ 自定义预设：把当前滑块数值保存为"我的预设"（自定义名字 + 图标）---- */
#ps-tab-filter .custom-preset-box{
    margin-top:12px;
    padding:11px;
    background:#f7f7ff;
    border:1px dashed #b9b0ff;
    border-radius:10px;
}
#ps-tab-filter .custom-preset-box .cp-title{
    font-size:12px;
    font-weight:bold;
    color:#5b4bff;
    margin-bottom:9px;
}
#ps-tab-filter .custom-preset-box .cp-row{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:9px;
}
/* 图标选择器：一排 emoji，单选高亮 */
#ps-tab-filter .cp-icon-pick{
    display:flex;
    flex-wrap:wrap;
    gap:6px;
    margin-bottom:9px;
}
#ps-tab-filter .cp-icon-pick .cp-icon-opt{
    width:28px;height:28px;
    display:flex;align-items:center;justify-content:center;
    border:1px solid #ddd;
    background:#fff;
    border-radius:6px;
    cursor:pointer;
    font-size:15px;
    line-height:1;
    transition:all 0.2s;
}
#ps-tab-filter .cp-icon-pick .cp-icon-opt:hover{ border-color:#5b4bff; }
#ps-tab-filter .cp-icon-pick .cp-icon-opt.cp-icon-active{
    background:#5b4bff;
    border-color:#5b4bff;
    box-shadow:0 0 0 2px rgba(91,75,255,0.2);
}
#ps-tab-filter .custom-preset-box input.cp-name{
    flex:1;
    min-width:0;
    height:28px;
    padding:0 10px;
    border:1px solid #ddd;
    border-radius:6px;
    font-size:12px;
    outline:none;
}
#ps-tab-filter .custom-preset-box input.cp-name:focus{ border-color:#5b4bff; }
#ps-tab-filter .custom-preset-box .cp-current{
    font-size:10.5px;
    color:#888;
    margin-bottom:9px;
    font-variant-numeric:tabular-nums;
}
#ps-tab-filter .custom-preset-box .cp-current b{ color:#5b4bff; }
#ps-tab-filter .custom-preset-box .cp-save-btn{
    width:100%;
    height:30px;
    border:none;
    background:linear-gradient(135deg,#6a5cff,#4b8cff);
    color:#fff;
    border-radius:6px;
    font-size:12px;
    font-weight:bold;
    cursor:pointer;
    transition:all 0.2s;
}
#ps-tab-filter .custom-preset-box .cp-save-btn:hover{ opacity:0.9; transform:translateY(-1px); }
#ps-tab-filter .custom-preset-box .cp-save-btn:disabled{ opacity:0.5; cursor:not-allowed; transform:none; }
/* 自定义预设项右上角删除按钮 */
#ps-tab-filter .filter-preset-btn .cp-del{
    position:absolute;
    top:-6px;right:-6px;
    width:16px;height:16px;
    border-radius:50%;
    background:#ff4d4f;
    color:#fff;
    font-size:10px;
    line-height:16px;
    text-align:center;
    cursor:pointer;
    display:none;
    z-index:2;
}
#ps-tab-filter .filter-preset-btn.cp-item{ position:relative; }
#ps-tab-filter .filter-preset-btn.cp-item:hover .cp-del{ display:block; }
/* ---- ★ 预设选择夹：快捷预设 / 我的预设 分开 ---- */
#ps-tab-filter .cp-tabs{
    display:flex;
    gap:8px;
    margin:5px 0 9px;
}
#ps-tab-filter .cp-tab{
    flex:1;
    text-align:center;
    font-size:12px;
    font-weight:bold;
    color:#666;
    padding:6px 0;
    border:1px solid #e2e2f0;
    border-radius:8px;
    background:#fff;
    cursor:pointer;
    transition:all 0.2s;
    user-select:none;
}
#ps-tab-filter .cp-tab:hover{ border-color:#5b4bff; color:#5b4bff; }
#ps-tab-filter .cp-tab.cp-tab-active{
    background:linear-gradient(135deg,#6a5cff,#4b8cff);
    border-color:transparent;
    color:#fff;
    box-shadow:0 2px 6px rgba(91,75,255,0.25);
}
#ps-tab-filter .cp-tab .cp-tab-count{
    display:inline-block;
    min-width:15px;
    height:15px;
    line-height:15px;
    padding:0 4px;
    margin-left:4px;
    font-size:10px;
    border-radius:8px;
    background:rgba(255,255,255,0.85);
    color:#5b4bff;
}
#ps-tab-filter .cp-tab.cp-tab-active .cp-tab-count{ background:rgba(255,255,255,0.95); }
/* ---- ★ 拖拽排序（我的预设面板）---- */
#ps-tab-filter .filter-presets .filter-preset-btn.cp-item[draggable="true"]{ cursor:grab; }
#ps-tab-filter .filter-presets .cp-item.cp-dragging{ opacity:0.4; cursor:grabbing; }
#ps-tab-filter .filter-presets .cp-item.cp-drag-over{
    outline:2px dashed #5b4bff;
    outline-offset:2px;
}
/* ---- ★ 批量操作按钮（删除当前 / 导出 / 导入）---- */
#ps-tab-filter .cp-batch-actions{
    display:flex;
    flex-wrap:wrap;
    gap:8px;
    margin-top:9px;
}
#ps-tab-filter .cp-action-btn{
    flex:1;
    min-width:72px;
    height:28px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    font-size:11.5px;
    color:#444;
    background:#fff;
    border:1px solid #e2e2f0;
    border-radius:6px;
    cursor:pointer;
    transition:all 0.2s;
}
#ps-tab-filter .cp-action-btn:hover{ border-color:#5b4bff; color:#5b4bff; }
#ps-tab-filter .cp-empty{
    font-size:11px;
    color:#aaa;
    text-align:center;
    padding:12px 0 2px;
}
/* ★ 预设状态条：面板底部小字，显示当前正在使用的预设 */
#ps-tab-filter .filter-preset-status{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    margin:14px 0 2px;
    padding:8px 10px;
    border-radius:9px;
    background:rgba(108,92,231,0.08);
    border:1px dashed rgba(108,92,231,0.28);
    font-size:12px;
    line-height:1.4;
    color:#6c5ce7;
    text-align:center;
    transition:background .25s ease, border-color .25s ease, color .25s ease;
}
#ps-tab-filter .filter-preset-status .fps-icon{ font-size:14px; line-height:1; flex:none; }
#ps-tab-filter .filter-preset-status .fps-label{ opacity:.7; flex:none; }
#ps-tab-filter .filter-preset-status .fps-name{ font-weight:600; }
#ps-tab-filter .filter-preset-status .fps-values{ opacity:.65; font-size:11px; }
#ps-tab-filter .filter-preset-status.is-none{
    background:rgba(0,0,0,0.035);
    border-color:rgba(0,0,0,0.10);
    color:#9a9aa6;
}
#ps-tab-filter .filter-preset-status.is-toast{
    background:rgba(46,204,113,0.12);
    border-color:rgba(46,204,113,0.4);
    color:#1e9e5a;
}
#ps-tab-filter .filter-preset-status.is-toast .fps-name{ color:#15803d; }
[data-pp-theme="dark"] #ps-tab-filter .filter-preset-status{
    background:rgba(139,127,255,0.14);
    border-color:rgba(139,127,255,0.32);
    color:#c3bbff;
}
[data-pp-theme="dark"] #ps-tab-filter .filter-preset-status.is-none{
    background:rgba(255,255,255,0.05);
    border-color:rgba(255,255,255,0.12);
    color:#8b8b98;
}
[data-pp-theme="dark"] #ps-tab-filter .filter-preset-status.is-toast{
    background:rgba(46,204,113,0.16);
    border-color:rgba(46,204,113,0.45);
    color:#6ee7a0;
}
[data-pp-theme="dark"] #ps-tab-filter .filter-preset-status.is-toast .fps-name{ color:#86efac; }
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

/* =====================================================================
   ★ 选集列表 UI 重设计（v0.08）
   - 弹窗居中、影片卡整合、线路带画质色标、集数紧凑网格、画质分组色条
   - 所有 class / data 属性与原版保持一致，探测·搜索·排序·点击逻辑零改动
   ===================================================================== */
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
/* ---- 弹窗遮罩：★ 选集列表窗口靠在最右侧（垂直仍居中）---- */
#episode-modal-mask{
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.45);
    backdrop-filter:blur(2px);
    z-index:2147483640;
    display:flex;
    align-items:center;       /* 垂直居中 */
    justify-content:flex-end; /* ★ 水平靠最右侧 */
    padding:40px 16px 40px 0; /* ★ 右侧贴边（左侧 padding 置 0，让弹窗顶到最右）*/
    box-sizing:border-box;
    animation: epMaskFadeIn 0.25s ease forwards;
}
@keyframes epMaskFadeIn{
    from{ opacity:0; }
    to  { opacity:1; }
}
/* ---- 弹窗主体 ---- */
#episode-modal-box{
    background:#ffffff;
    width:680px;
    max-width:96vw;
    max-height:calc(100vh - 80px);
    border-radius:18px;
    overflow:hidden;
    display:flex;
    flex-direction:column;
    box-shadow:0 20px 60px rgba(0,0,0,0.4);
    animation: epBoxPop 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes epBoxPop{
    from{ opacity:0; transform:translateY(24px) scale(0.96); }
    to  { opacity:1; transform:translateY(0) scale(1); }
}
/* ---- 顶部标题栏 ---- */
.ep-header{
    display:flex;
    align-items:center;
    padding:14px 18px;
    background:linear-gradient(135deg,#ff8a65 0%,#ff7043 100%);
    color:#fff;
    gap:12px;
    border-bottom:1px solid rgba(0,0,0,0.06);
    flex-shrink:0;
}
.ep-title{
    font-size:17px;
    font-weight:700;
    flex-shrink:0;
    color:#fff;
    letter-spacing:0.3px;
}
.ep-count{
    font-size:13px;
    opacity:0.92;
    color:#fff;
}
.ep-count b{ color:#fff; font-size:15px; font-weight:800; }
.ep-spacer{ flex:1; }
.ep-close{
    background:rgba(255,255,255,0.22);
    border:none;
    color:#fff;
    width:30px; height:30px;
    border-radius:50%;
    cursor:pointer;
    font-size:16px;
    display:flex; align-items:center; justify-content:center;
    transition:background 0.2s;
}
.ep-close:hover{ background:rgba(255,255,255,0.4); }
/* ---- 影片信息卡 ---- */
.ep-movie-card{
    display:flex;
    gap:14px;
    padding:14px 18px;
    background:linear-gradient(135deg,#fff8f0 0%,#fff3e0 100%);
    border-bottom:1px solid #ffe0b2;
    flex-shrink:0;
}
.ep-movie-poster{ flex:0 0 64px; width:64px; align-self:flex-start; }
.ep-movie-poster-img{
    width:64px; height:90px; object-fit:cover; border-radius:10px; display:block;
    box-shadow:0 3px 10px rgba(255,112,67,0.3); background:#eee;
}
.ep-movie-poster-placeholder{
    width:64px; height:90px; border-radius:10px;
    background:linear-gradient(135deg,#ff8a65,#ff7043);
    color:#fff; font-size:30px;
    display:flex; align-items:center; justify-content:center;
    box-shadow:0 3px 10px rgba(255,112,67,0.3);
}
.ep-movie-meta{ flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }
.ep-movie-title{
    font-size:16px; font-weight:700; color:#222;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    display:flex; align-items:center; flex-wrap:wrap; gap:6px;
}
.ep-movie-year{ font-size:13px; font-weight:400; color:#e65100; }
.ep-movie-genre{
    font-size:11px; font-weight:500; color:#fff; background:#ff8a65;
    padding:1px 8px; border-radius:10px; white-space:nowrap;
}
.ep-movie-intro{
    font-size:12.5px; color:#666; line-height:1.55;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden; text-overflow:ellipsis; transition:all 0.25s;
}
.ep-movie-intro.ep-intro-long{ /* 内容较长标记，显隐由 JS 按渲染高度判定 */ }
.ep-movie-intro.ep-intro-expanded{
    -webkit-line-clamp:unset; max-height:none; overflow:auto;
    white-space:pre-wrap; word-break:break-word;
}
.ep-intro-toggle{
    align-self:flex-start; font-size:11px; color:#e65100;
    background:transparent; border:1px solid #ffccbc; border-radius:10px;
    padding:1px 8px; cursor:pointer; margin-top:2px;
}
.ep-intro-toggle:hover{ background:#fff3e0; }
.ep-intro-toggle[hidden]{ display:none; }
/* ---- 站点信息 + 上次选择（合并为一行两栏） ---- */
.ep-info-bar{
    display:flex; align-items:center; gap:12px;
    padding:8px 18px; background:#fafafa; border-bottom:1px solid #eee;
    flex-shrink:0;
}
.ep-current-info{
    font-size:12px; color:#555; display:flex; align-items:center; gap:6px;
    min-width:0; flex:1; white-space:nowrap; overflow:hidden;
}
.ep-cur-path{ color:#999; font-size:11px; }
.ep-record-info{
    font-size:12px; color:#e65100; background:#fff8e1;
    border:1px solid #ffe0b2; border-radius:10px; padding:2px 10px;
    font-weight:600; white-space:nowrap; flex-shrink:0;
}
/* ---- 探测状态条（独立占位，避免与 header 重叠） ---- */
.ep-probe-status{
    display:block; width:100%; box-sizing:border-box;
    font-size:12px; color:#e65100; font-weight:600;
    padding:4px 18px; text-align:left; flex-shrink:0;
    background:#fff8f0; border-bottom:1px solid #ffe0b2; min-height:14px;
}
/* ---- 线路 tab 列表：胶囊化 + 画质色点 ---- */
.ep-line-tabs{
    display:flex; gap:8px; padding:12px 16px;
    background:#fafafa; border-bottom:1px solid #e8e8e8;
    overflow-x:auto; flex-shrink:0;
    scrollbar-width:thin;
}
.ep-line-tab{
    display:flex; align-items:center; justify-content:center;
    gap:5px; padding:6px 14px; border-radius:20px;
    font-size:13px; cursor:pointer; white-space:nowrap;
    background:#fff; border:1px solid #e0e0e0; color:#444;
    transition:all 0.2s; flex-shrink:0; position:relative;
}
.ep-line-tab:hover{ border-color:#ff8a65; color:#ff7043; background:#fff3e0; }
.ep-line-tab.ep-line-active{
    background:linear-gradient(135deg,#ff8a65,#ff7043);
    color:#fff; border-color:#ff7043; font-weight:700;
    box-shadow:0 3px 10px rgba(255,112,67,0.35);
}
/* ★【小优化一】打开选集时，"当前正在播放线路"的按钮短暂高亮，便于一眼定位 */
.ep-line-tab.ep-tab-playing-hint{
    animation:epTabPlayingPulse 0.9s ease 2;
}
@keyframes epTabPlayingPulse{
    0%  { box-shadow:0 0 0 0 rgba(255,112,67,0.55); }
    70% { box-shadow:0 0 0 10px rgba(255,112,67,0); }
    100%{ box-shadow:0 0 0 0 rgba(255,112,67,0); }
}
.ep-line-tab small{ opacity:0.85; font-size:11px; }
/* 线路名（探测徽标容器，probeAllLines 动态注入 .ep-probe-badge） */
.ep-tab-name{ display:inline-flex; align-items:center; }
/* 画质色点：4K/蓝光/高清/720P/标清/默认 */
.ep-tab-dot{ width:8px; height:8px; border-radius:50%; background:#bbb; flex-shrink:0; }
.ep-line-tab.q-4k   .ep-tab-dot{ background:#1e88e5; }   /* 蓝 */
.ep-line-tab.q-bd   .ep-tab-dot{ background:#8e24aa; }   /* 紫 */
.ep-line-tab.q-hd   .ep-tab-dot{ background:#2e7d32; }   /* 绿 */
.ep-line-tab.q-720  .ep-tab-dot{ background:#f9a825; }   /* 橙黄 */
.ep-line-tab.q-sd   .ep-tab-dot{ background:#78909c; }   /* 青灰 */
.ep-line-tab.q-def  .ep-tab-dot{ background:#b0bec5; }
/* ---- 探测徽标（由 probeAllLines 动态注入到 .ep-line-tab） ---- */
.ep-probe-badge{ display:inline-flex; align-items:center; font-size:11px; line-height:1; margin-left:2px; }
.ep-probe-badge .lp-dot{ font-style:normal; }
.ep-line-tab.ep-line-best{
    background:linear-gradient(135deg,#e8f5e9,#c8e6c9);
    border-color:#43a047; color:#1b5e20; font-weight:700;
}
.ep-line-tab.ep-line-best::before{
    content:'★推荐'; font-size:9px; background:#43a047; color:#fff;
    padding:1px 5px; border-radius:8px; margin-right:3px;
}
/* ---- 线路面板（集数列表区） ---- */
.ep-line-panel{
    padding:14px 16px; overflow-y:auto; flex:1; background:#ffffff;
    scrollbar-width:thin;
}
.ep-line-info{
    font-size:14px; font-weight:700; color:#ff7043;
    margin-bottom:10px; padding-bottom:6px; border-bottom:1px dashed #e0e0e0;
}
.ep-line-info small{ font-weight:400; color:#999; font-size:12px; }
/* ---- 集数网格：紧凑圆角卡片 ---- */
.ep-grid{
    display:grid;
    grid-template-columns:repeat(auto-fill, minmax(64px,1fr));
    gap:8px;
}
.ep-item{
    display:flex; align-items:center; justify-content:center;
    padding:9px 4px; border-radius:10px;
    background:#f5f5f5; border:1px solid #e8e8e8;
    font-size:13px; color:#333; text-decoration:none;
    cursor:pointer; transition:all 0.16s;
    text-align:center; line-height:1.2;
    word-break:break-all; font-weight:600;
}
.ep-item:hover{
    background:#ff7043; color:#fff; border-color:#ff7043;
    transform:translateY(-2px); box-shadow:0 4px 12px rgba(255,112,67,0.35);
}
.ep-item:active{ transform:scale(0.94); }
.ep-item.ep-selected{
    background:linear-gradient(135deg,#ff8a65,#ff7043) !important;
    color:#fff !important; border-color:#ff7043 !important;
    box-shadow:0 3px 10px rgba(255,112,67,0.45); font-weight:700;
}
/* ---- ★ 电影画质分组：左侧色条分节卡片 ---- */
.ep-group-panel{
    background:#fcfcfc; position:relative;
    border-left:4px solid #ff7043;   /* 默认色，按画质覆盖 */
}
.ep-group-panel.q-4k  { border-left-color:#1e88e5; }
.ep-group-panel.q-bd  { border-left-color:#8e24aa; }
.ep-group-panel.q-hd  { border-left-color:#2e7d32; }
.ep-group-panel.q-720 { border-left-color:#f9a825; }
.ep-group-panel.q-sd  { border-left-color:#78909c; }
.ep-group-title{
    display:flex; align-items:center; gap:10px;
    color:#333; border-bottom:2px solid #eee;
}
.ep-group-quality{
    font-size:14px; font-weight:800; color:#fff;
    background:#ff7043; padding:2px 12px; border-radius:6px; letter-spacing:0.5px;
}
.ep-group-panel.q-4k  .ep-group-quality{ background:#1e88e5; }
.ep-group-panel.q-bd  .ep-group-quality{ background:#8e24aa; }
.ep-group-panel.q-hd  .ep-group-quality{ background:#2e7d32; }
.ep-group-panel.q-720 .ep-group-quality{ background:#f9a825; }
.ep-group-panel.q-sd  .ep-group-quality{ background:#78909c; }
.ep-group-meta{ font-size:12px; color:#999; font-weight:500; }
.ep-sub-line{
    margin:10px 0 6px; padding:10px 12px;
    background:#fff; border:1px solid #eee; border-radius:10px;
}
.ep-sub-line-info{
    display:flex; align-items:center; gap:6px;
    font-size:12.5px; font-weight:700; color:#555;
    margin-bottom:8px; padding-bottom:6px; border-bottom:1px dotted #ddd;
}
.ep-sub-line-info small{ color:#999; font-weight:500; }
.ep-sub-dot{ width:7px; height:7px; border-radius:50%; background:#ff7043; flex-shrink:0; }
/* ---- 底部说明栏 ---- */
.ep-footer{
    padding:9px 16px; font-size:11px; color:#999;
    text-align:center; background:#fafafa;
    border-top:1px solid #eee; flex-shrink:0;
}
/* ---- 深色模式适配（prefers-color-scheme） ---- */
@media (prefers-color-scheme:dark){
    #episode-modal-box{ background:#1e1e2c; box-shadow:0 20px 60px rgba(0,0,0,0.6); }
    .ep-header{ background:linear-gradient(135deg,#3a2a24,#4a3028); }
    .ep-movie-card{ background:linear-gradient(135deg,#2a2228,#241c20); border-bottom-color:#5a3a2e; }
    .ep-movie-title{ color:#eee; }
    .ep-movie-intro{ color:#bbb; }
    .ep-info-bar{ background:#252535; border-bottom-color:#3a3a4a; }
    .ep-current-info{ color:#bbb; }
    .ep-record-info{ background:#3a3220; border-color:#5a4a2a; color:#ffb74d; }
    .ep-probe-status{ background:#2a2418; border-bottom-color:#5a4a2e; color:#ffb74d; }
    .ep-line-tabs{ background:#252535; border-bottom-color:#3a3a4a; }
    .ep-line-tab{ background:#2e2e40; border-color:#444; color:#ddd; }
    .ep-line-tab:hover{ background:#3a2e28; color:#ffb74d; border-color:#ff7043; }
    .ep-line-panel{ background:#1e1e2c; }
    .ep-line-info{ color:#ffb74d; border-bottom-color:#3a3a4a; }
    .ep-grid{ gap:8px; }
    .ep-item{ background:#2e2e40; border-color:#444; color:#ddd; }
    .ep-item:hover{ background:#ff7043; color:#fff; }
    .ep-sub-line{ background:#252535; border-color:#3a3a4a; }
    .ep-sub-line-info{ color:#ccc; border-bottom-color:#3a3a4a; }
    .ep-footer{ background:#252535; border-top-color:#3a3a4a; color:#888; }
    #hhkan-resume-bar{ background:linear-gradient(135deg,#1a1a2e,#16213e); }
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
    // ★ 任务栏按钮（排序 / 分组 · 集中维护）：
    //   ① 导航组(tb-nav)：回退 · 前进 · 刷新
    //   ② 功能组(tb-main)：每日推荐 · 继续观看 · 全局设置 · 本地播放 · 置顶窗口
    //   ③ 系统组(tb-sys)：更新公告 · 删除APP
    //   ※ 要调整顺序 / 增删按钮，只改这里一处即可，全站统一生效。
    topBar.innerHTML = `
        <div class="tb-group tb-nav">
            <button id="btn-back"       title="返回上一页 (Alt+←)">⬅️ 回退</button>
            <button id="btn-forward"    title="前进到下一页 (Alt+→)">➡️ 前进</button>
            <button id="btn-reload"     title="刷新当前页 (Ctrl+R)">🔄 刷新</button>
        
            <button id="btn-recommend"  title="每日影视推荐">🎬 每日推荐</button>
            <button id="btn-continue"   title="继续观看历史记录">⏯ 继续观看</button>
            <button id="btn-settings"   title="全局设置（快捷键/自动全屏/片尾续播）">⚙ 全局设置</button>
            <button id="btn-local-play" title="打开本地视频播放器">📂 本地播放</button>
            <button id="btn-topmost"    title="窗口置顶（Pake 客户端可用）">📌 置顶窗口</button>
        
            <button id="btn-notice"     title="查看本次更新公告">📋 更新公告</button>
           
        </div>
    `;
    document.body.appendChild(topBar);
    // ★ 关键：让网页【所有内容整体下移】一个顶栏高度（BAR_HEIGHT），
    //   为固定在最顶的任务栏让出空间。这样任务栏始终在最顶，而网页自身
    //   的布局/样式完全不被逐个改动（不用再去逐个偏移每个元素）。
    //   用 paddingTop 而非 marginTop，避免被 body 首个子元素的 margin 塌陷抵消。
    document.documentElement.style.paddingTop = BAR_HEIGHT + 'px';
    document.body.style.paddingTop = BAR_HEIGHT + 'px';
    watchVideoElements();
}
// ==================== 顶部栏按钮点击事件 ====================
// ★ 统一事件代理：每个按钮对应一个已存在的功能函数，新增/调整按钮只需在此映射。
// ★ 注意：继续观看 / 全局设置 / 更新公告 的打开函数是各模块 IIFE 内的局部函数，
//   故通过 window.__hhkanActions（由各模块挂载）中转，避免跨作用域引用报错；
//   其它函数（history / location / openRecommendModal 等）为全局可直接调用。
// ★ 说明：__hhkanActions.continue / settings / notice 由各自所在模块（IIFE 内部）
//   在函数定义处直接挂载（如 `window.__hhkanActions.continue = openContinueWatch;`），
//   从而把局部函数引用带到全局，供下方事件代理调用。此处仅确保容器对象存在。
window.__hhkanActions = window.__hhkanActions || {};
document.body.addEventListener('click',(e)=>{
    const target = e.target;
    if(target.id === 'btn-back')           history.back();
    else if(target.id === 'btn-forward')   history.forward();
    else if(target.id === 'btn-reload')    location.reload();
    else if(target.id === 'btn-recommend') openRecommendModal();
    else if(target.id === 'btn-continue')  window.__hhkanActions.continue();
    else if(target.id === 'btn-settings')  window.__hhkanActions.settings();
    else if(target.id === 'btn-local-play')openLocalPlayerModal();
    else if(target.id === 'btn-topmost')   toggleTopMost(target);
    else if(target.id === 'btn-notice')    window.__hhkanActions.notice();
    else if(target.id === 'btn-delapp')    uninstallApp();
    else if(target.id === 'btn-player-set')openPlayerSettingModal(false); // 兼容旧入口
    else if(target.id === 'btn-app')       openAppModal();               // 兼容旧入口
})
// ★ 删除 / 卸载本应用：先二次确认，再按运行环境执行卸载
function uninstallApp(){
    if(!confirm('确定要删除 / 卸载「好好看」应用吗？此操作不可恢复。')) return;
    // Pake / Tauri 客户端：调用系统卸载能力（若打包时注册了相应命令）
    if(window.__TAURI__){
        try{
            const tauri = window.__TAURI__;
            // 优先尝试 invoke 卸载命令（需在 tauri.conf.json 的 permissions 中注册）
            if(tauri.core && typeof tauri.core.invoke === 'function'){
                tauri.core.invoke('uninstall_app').catch(()=>{});
            }
            // 无论如何先关闭当前窗口
            const win = tauri.window && tauri.window.getCurrentWindow();
            if(win){ win.close(); return; }
        }catch(e){ console.warn('[卸载] Tauri 卸载调用失败：', e); }
    }
    // 浏览器 / WebView 预览环境：无法真正卸载，给出引导提示
    alert('当前为浏览器预览模式，无法自动卸载。\n如需删除，请在系统中卸载 Pake 客户端：\n  · Windows：控制面板 → 卸载程序\n  · macOS：将应用拖入废纸篓\n  · 安卓/iOS：长按应用图标卸载');
}
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
            block += `<div class="rec-item rec-dynamic" data-title="${item.title.replace(/"/g,'"')}" data-score="${item.doubanScore}">
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
        const name = f.name.replace(/</g, '&lt;').replace(/"/g, '"');
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
    // 片头/片尾秒数（0~900，最大15分钟）
    const intro = Math.max(0, Math.min(900, parseInt(setting.skipIntro,10)||0));
    const outro = Math.max(0, Math.min(900, parseInt(setting.skipOutro,10)||0));
    const fmt = s => s>0 ? `${Math.floor(s/60)}分${s%60}秒` : '关闭';
    let html = `<div id="player-setting-box">
        <h3>⚙ 播放器设置</h3>`;
    // ---- ★ Tab 选择夹分类：常规 / 画面调节 ----
    html += `<div class="ps-tabs" id="ps-tabs">
        <div class="ps-tab ps-tab-active" data-tab="general">⚙ 常规</div>
        <div class="ps-tab" data-tab="filter">🎨 画面调节</div>
    </div>`;
    // ===== 「常规」页：画面比例 + 跳过片头片尾 + 播放倍速 =====
    html += `<div class="ps-tab-panel ps-tab-panel-active" id="ps-tab-general">`;
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
    // ---- 跳过片头 ----
    html += `<div class="setting-group">
        <label>⏩ 跳过片头（秒）<span class="setting-val" id="intro-val">${fmt(intro)}</span></label>
        <input type="range" id="intro-range" min="0" max="900" step="10" value="${intro}">
        <div class="setting-desc">片头 N 秒后自动跳过。范围 0~900 秒（15 分钟）</div>
    </div>`;
    // ---- 跳过片尾 ----
    html += `<div class="setting-group">
        <label>⏭️ 跳过片尾（秒）<span class="setting-val" id="outro-val">${fmt(outro)}</span></label>
        <input type="range" id="outro-range" min="0" max="900" step="10" value="${outro}">
        <div class="setting-desc">剩余 N 秒时自动播放下一集。范围 0~900 秒（15 分钟）</div>
    </div>`;
    // ---- ★ 播放倍速 ----
    html += `<div class="setting-group">
        <label>🎚️ 播放倍速 <span class="setting-val" id="rate-val">${setting.playbackRate}x</span></label>
        <div class="fit-buttons" id="rate-buttons">`;
    PLAYBACK_RATE_OPTIONS.forEach(r=>{
        const active = (Math.abs(setting.playbackRate - r) < 0.001) ? 'fit-active' : '';
        html += `<button class="${active}" data-rate="${r}">${r}x</button>`;
    });
    html += `</div>
        <div class="setting-desc">设置后所有影片统一以此倍速播放，全局生效。</div>
    </div>`;
    // ---- ★ 音量（0~100，全局生效，实时应用到当前所有 video）----
    html += `<div class="setting-group">
        <label>🔊 音量 <span class="setting-val" id="vol-val">${setting.volume}%</span></label>
        <input type="range" id="vol-range" min="0" max="100" step="1" value="${setting.volume}">
        <div class="setting-desc">调节当前影片音量，全局生效，拖动即实时预览生效。</div>
    </div>`;
    // ---- ★ 影片亮度（常规页便捷入口，与「画面调节」页双向实时同步同一数值）----
    html += `<div class="setting-group">
        <label>☀️ 影片亮度 <span class="setting-val" id="gen-brightness-val">${setting.brightness}%</span></label>
        <input type="range" id="gen-brightness-range" min="0" max="200" step="1" value="${setting.brightness}">
        <div class="setting-desc">等同于「画面调节」里的亮度，两处改动互相实时同步。</div>
        <button type="button" class="ps-reset-btn" id="gen-brightness-reset">↺ 恢复默认亮度（100%）</button>
    </div>`;
    html += `</div>`; // end #ps-tab-general
    // ===== 「画面调节」页：快捷预设（只读预览） / 我的预设（可调节数值 + 保存自定义）=====
    html += `<div class="ps-tab-panel" id="ps-tab-filter">
        <div class="setting-group">
            <div class="filter-presets-label" style="display:none" id="filter-presets-builtin-title"></div>
            <!-- ★ 预设选择夹：内置「快捷预设」与「我的预设」分开 -->
            <div class="cp-tabs">
                <div class="cp-tab cp-tab-active" data-cp-tab="builtin">🎬 快捷预设</div>
                <div class="cp-tab" data-cp-tab="custom">🎨 我的预设 <span class="cp-tab-count" id="cp-tab-count">0</span></div>
            </div>
            <!-- 面板：快捷预设（内置，只读，不可删；不含滑块与保存框） -->
            <div class="cp-tab-panel cp-panel-builtin">
                <div class="filter-presets" id="filter-presets-builtin"></div>
                <div class="filter-drawer-tip">提示：点击任一快捷预设即可即时预览套用，数值为固定档位，不可在此调节；如需自定义数值并保存，请切换到「我的预设」。</div>
            </div>
            <!-- ★ 当前预设状态条：始终可见，随选中态实时刷新（成功提示在此显示） -->
            <div class="filter-preset-status" id="filter-preset-status"></div>
            <!-- 面板：我的预设（含数值调节滑块 + 保存为我的预设 + 自定义预设管理） -->
            <div class="cp-tab-panel cp-panel-custom" style="display:none;">
                <div class="custom-preset-box">
                    <div class="cp-title">🎚️ 自定义数值（仅在此处可调节，拖动滑块即时预览）</div>
                    <div class="setting-group">
                        <label>☀️ 亮度 <span class="setting-val" id="brightness-val">${setting.brightness}%</span></label>
                        <input type="range" id="brightness-range" min="0" max="200" step="1" value="${setting.brightness}">
                    </div>
                    <div class="setting-group">
                        <label>🌈 饱和度 <span class="setting-val" id="saturation-val">${setting.saturation}%</span></label>
                        <input type="range" id="saturation-range" min="0" max="200" step="1" value="${setting.saturation}">
                    </div>
                    <div class="setting-group">
                        <label>🌗 对比度 <span class="setting-val" id="contrast-val">${setting.contrast}%</span></label>
                        <input type="range" id="contrast-range" min="0" max="200" step="1" value="${setting.contrast}">
                    </div>
                </div>
                <div class="filter-presets-label">⚡ 我的预设（点击即套用，可拖拽排序 / 删除）</div>
                <div class="filter-presets" id="filter-presets-custom"></div>
                <div class="cp-empty" id="cp-empty" style="display:none;">暂无自定义预设，在下方给当前数值起个名字保存即可~</div>
                <div class="cp-batch-actions">
                    <button class="cp-action-btn" id="cp-del-current" title="删除与当前滑块数值一致的自定义预设">🗑️ 删除当前预设</button>
                    <button class="cp-action-btn" id="cp-export" title="导出我的预设为 JSON 文件">📤 导出</button>
                    <label class="cp-action-btn" for="cp-import-file" title="从 JSON 文件导入预设">📥 导入</label>
                    <input type="file" id="cp-import-file" accept="application/json,.json" style="display:none;">
                </div>
                <div class="setting-group">
                    <div class="custom-preset-box">
                        <div class="cp-title">➕ 保存为我的预设（给当前数值起个名字 + 选个图标）</div>
                        <div class="cp-row">
                            <div class="cp-icon-pick" id="cp-icon-pick"></div>
                        </div>
                        <div class="cp-row">
                            <input class="cp-name" id="cp-name" type="text" maxlength="12" placeholder="自定义名称，如：深夜模式">
                        </div>
                        <div class="cp-current">将保存当前数值 → 亮度 <b id="cp-cur-b">-</b> · 饱和度 <b id="cp-cur-s">-</b> · 对比度 <b id="cp-cur-c">-</b></div>
                        <button class="cp-save-btn" id="cp-save-btn">💾 保存当前数值为我的预设</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`; // end #ps-tab-filter
    html += `</div>`;   // end #player-setting-box（无需保存按钮，底部留白收尾）
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
    // 片头/片尾滑块实时显示（秒 -> X分X秒 / 关闭）
    const _fmt = s => s>0 ? `${Math.floor(s/60)}分${s%60}秒` : '关闭';
    const introRange = mask.querySelector('#intro-range');
    const outroRange = mask.querySelector('#outro-range');
    const introVal = mask.querySelector('#intro-val');
    const outroVal = mask.querySelector('#outro-val');
    if(introRange && introVal) introRange.addEventListener('input', ()=>{ introVal.textContent = _fmt(+introRange.value); commitSettings(); });
    if(outroRange && outroVal) outroRange.addEventListener('input', ()=>{ outroVal.textContent = _fmt(+outroRange.value); commitSettings(); });
    // 画面比例按钮组：单选高亮（独立 group，排除倍速组）
    const fitGroup = mask.querySelector('.fit-buttons:not(#rate-buttons)');
    if(fitGroup){
        fitGroup.querySelectorAll('button').forEach(btn=>{
            btn.onclick = ()=>{
                fitGroup.querySelectorAll('button').forEach(b=>b.classList.remove('fit-active'));
                btn.classList.add('fit-active');
                commitSettings();   // ★ 选中即生效（落地 + 即时应用到所有 video）
            };
        });
    }
    // ★ 倍速按钮组：单选高亮，实时更新倍速数值显示
    const rateGroup = mask.querySelector('#rate-buttons');
    const rateVal = mask.querySelector('#rate-val');
    if(rateGroup){
        rateGroup.querySelectorAll('button').forEach(btn=>{
            btn.onclick = ()=>{
                rateGroup.querySelectorAll('button').forEach(b=>b.classList.remove('fit-active'));
                btn.classList.add('fit-active');
                if(rateVal) rateVal.textContent = parseFloat(btn.dataset.rate)+'x';
                commitSettings();   // ★ 选中即生效（落地 + 即时应用到所有 video）
            };
        });
    }
    // ★ Tab 选择夹切换：常规 / 画面调节 两个分类面板
    const psTabs = mask.querySelector('#ps-tabs');
    if(psTabs){
        psTabs.querySelectorAll('.ps-tab').forEach(tab=>{
            tab.addEventListener('click', ()=>{
                const target = tab.dataset.tab;
                psTabs.querySelectorAll('.ps-tab').forEach(t=>t.classList.toggle('ps-tab-active', t===tab));
                mask.querySelector('#ps-tab-general').classList.toggle('ps-tab-panel-active', target==='general');
                mask.querySelector('#ps-tab-filter').classList.toggle('ps-tab-panel-active', target==='filter');
            });
        });
    }
    // ★ 音量滑块：实时更新数值显示 + 实时预览应用到所有 video
    const volRange = mask.querySelector('#vol-range');
    const volVal = mask.querySelector('#vol-val');
    if(volRange){
        const onVol = ()=>{
            const v = Math.max(0, Math.min(100, parseInt(volRange.value,10)||0));
            if(volVal) volVal.textContent = v+'%';
            document.querySelectorAll('video').forEach(vd=>{
                if(!vd.closest || !vd.closest('#local-player-mask')) applyVolume(vd, v);
            });
            commitSettings();
        };
        volRange.addEventListener('input', onVol);
        volRange.addEventListener('change', onVol);
    }
    // ★ 常规页「影片亮度」滑块：与「画面调节」页亮度滑块双向实时同步
    const genBrRange = mask.querySelector('#gen-brightness-range');
    const genBrVal = mask.querySelector('#gen-brightness-val');
    if(genBrRange){
        const onGenBrightness = ()=>{
            const b = clampPct2(genBrRange.value);
            if(genBrVal) genBrVal.textContent = b+'%';
            // 同步到画面调节页滑块（若存在）
            if(brRange) brRange.value = b;
            // 同步到当前生效值 + 预览
            applyFilterValues(b, _curFilter.s, _curFilter.c);
        };
        genBrRange.addEventListener('input', onGenBrightness);
        genBrRange.addEventListener('change', onGenBrightness);
    }
    // ★ 【BUG 三修复】恢复默认亮度：一键把亮度重置为 100%（与饱和度/对比度无关，
    //   只复位亮度），同时同步到「画面调节」页滑块并实时预览 + 落地。
    const genBrReset = mask.querySelector('#gen-brightness-reset');
    if(genBrReset){
        genBrReset.addEventListener('click', ()=>{
            const defB = 100;
            const rng = mask.querySelector('#gen-brightness-range');
            if(rng) rng.value = defB;
            const valEl = mask.querySelector('#gen-brightness-val');
            if(valEl) valEl.textContent = defB + '%';
            // 同步到画面调节页滑块 + 预览 + 落地
            if(brRange) brRange.value = defB;
            applyFilterValues(defB, _curFilter.s, _curFilter.c);
            if(window.showFloatTip) window.showFloatTip('已恢复默认亮度（100%）☀️');
        });
    }
    // ★ 三个滑块：实时联动数值显示 + 实时预览（无需点保存即生效）
    const brRange = mask.querySelector('#brightness-range');
    const saRange = mask.querySelector('#saturation-range');
    const coRange = mask.querySelector('#contrast-range');
    const brVal = mask.querySelector('#brightness-val');
    const saVal = mask.querySelector('#saturation-val');
    const coVal = mask.querySelector('#contrast-val');
    const filterPanel = mask.querySelector('#ps-tab-filter');
    // ★ 当前生效的画面调节值（滑块 / 预设点击 都是往这里写，预览与保存统一从这里读）
    const _curFilter = { b: setting.brightness, s: setting.saturation, c: setting.contrast };
    const clampPctVal = v => Math.max(0, Math.min(200, parseInt(v,10)||0));
    const refreshFilter = ()=>{
        // ★ 滑块仅在"我的预设"面板内存在；有滑块就优先读滑块，否则用当前生效值
        let b, sa, c;
        if(brRange){ b  = clampPctVal(brRange.value); _curFilter.b  = b; }
        else { b = _curFilter.b; }
        if(saRange){ sa = clampPctVal(saRange.value); _curFilter.s = sa; }
        else { sa = _curFilter.s; }
        if(coRange){ c  = clampPctVal(coRange.value); _curFilter.c = c; }
        else { c = _curFilter.c; }
        if(brVal) brVal.textContent = b+'%';
        if(saVal) saVal.textContent = sa+'%';
        if(coVal) coVal.textContent = c+'%';
        // ★ 手动拖动滑块 = 用户离开预设、自定参数，清除持久化的预设选中态，
        //   否则会出现"数值是 105% 但高亮仍停在默认"的自相矛盾。
        //   只有当前数值恰好等于某预设时才保留高亮（兜底反查）。
        const cur = { b:_curFilter.b, s:_curFilter.s, c:_curFilter.c };
        const stillMatch = FILTER_PRESETS.some(p => p.brightness===cur.b && p.saturation===cur.s && p.contrast===cur.c)
                        || getCustomPresets().some(p => p.brightness===cur.b && p.saturation===cur.s && p.contrast===cur.c);
        if(!stillMatch){ setActivePresetKey(''); }
        // 实时预览：直接套用到当前所有站点 video
        document.querySelectorAll('video').forEach(v=>{
            if(!v.closest || !v.closest('#local-player-mask')){
                v.style.filter = `brightness(${b}%) saturate(${sa}%) contrast(${c}%)`;
            }
        });
        // ★ 滑块拖动过程中同步落地到 localStorage（即时生效，无需保存按钮）
        commitSettings();
    };
    // ★ 由预设按钮（含快捷预设）套用一组数值：写入当前生效值 + 同步到滑块(若存在) + 预览
    const applyFilterValues = (b, sa, c)=>{
        _curFilter.b = clampPctVal(b);
        _curFilter.s = clampPctVal(sa);
        _curFilter.c = clampPctVal(c);
        if(brRange){ brRange.value = _curFilter.b; }
        if(saRange){ saRange.value = _curFilter.s; }
        if(coRange){ coRange.value = _curFilter.c; }
        if(brVal) brVal.textContent = _curFilter.b+'%';
        if(saVal) saVal.textContent = _curFilter.s+'%';
        if(coVal) coVal.textContent = _curFilter.c+'%';
        document.querySelectorAll('video').forEach(v=>{
            if(!v.closest || !v.closest('#local-player-mask')){
                v.style.filter = `brightness(${_curFilter.b}%) saturate(${_curFilter.s}%) contrast(${_curFilter.c}%)`;
            }
        });
        // ★ 预设套用后同步落地到 localStorage（即时生效，无需保存按钮）
        commitSettings();
    };
    [['input', brRange, 'brightness'], ['change', brRange, 'brightness'],
     ['input', saRange, 'saturation'], ['change', saRange, 'saturation'],
     ['input', coRange, 'contrast'],   ['change', coRange, 'contrast']
    ].forEach(([evt, el])=>{ if(el) el.addEventListener(evt, refreshFilter); });
    // ★ 快捷预设按钮：动态生成，点击即套用数值并实时预览 + 高亮当前预设
    //   （内置预设 与 用户自定义预设 分在两个选择夹面板里分别渲染）
    const builtinHost  = mask.querySelector('#filter-presets-builtin');
    const customHost   = mask.querySelector('#filter-presets-custom');
    const cpTabCount   = mask.querySelector('#cp-tab-count');
    const cpEmpty      = mask.querySelector('#cp-empty');
    // ★ 根据当前生效的画面值（_curFilter），生成"匹配键"用于高亮 & 删除当前预设
    //   —— 注意：高亮的权威来源是持久化的 presetKey（见下方 getActiveKey），
    //      这里仅作为"用户手动拖过滑块后"的兜底匹配，避免拖动后所有按钮全无高亮。
    const curMatch = ()=> ({
        b: _curFilter.b, s: _curFilter.s, c: _curFilter.c,
    });
    // ★ 当前应高亮的预设 key：优先读持久化记录，兜底按数值反查
    function getActiveKey(){
        const k = getActivePresetKey();
        if(k) return k;
        const cur = curMatch();
        const hit = FILTER_PRESETS.find(p => p.brightness===cur.b && p.saturation===cur.s && p.contrast===cur.c);
        return hit ? hit.key : '';
    }
    // ★ 绑定单条预设按钮的"套用"逻辑（内置 / 自定义共用）
    //   （快捷预设 / 我的预设 都通过 applyFilterValues 套用，即使滑块在另一面板也能即时预览）
    function bindPresetClick(btn, p){
        btn.onclick = ()=>{
            applyFilterValues(p.brightness, p.saturation, p.contrast);
            // ★ 持久化记录当前选中的预设（以 key 为准，彻底解决"选中不记录"）
            setActivePresetKey(p.key || '');
            // 两个面板里都清除高亮，再给当前这条加上
            filterPanel.querySelectorAll('.filter-preset-btn').forEach(b=>b.classList.remove('preset-active'));
            btn.classList.add('preset-active');
            // ★ 底部状态条弹出"已套用"成功提示
            flashPresetStatus(p);
        };
    }
    // ★ 重建（自定义面板支持 HTML5 拖拽排序 + 每条右上角删除）
    function renderPresets(){
        const activeKey = getActiveKey();   // ★ 以持久化的 key 为准判定高亮
        // ---- 内置预设 ----
        if(builtinHost){
            builtinHost.innerHTML = '';
            // ★ 单个 3 列网格容器，9 个预设正好排成 3 行 3 列
            const box = document.createElement('div');
            box.className = 'filter-presets';
            FILTER_PRESETS.forEach(p=>{
                const btn = document.createElement('button');
                btn.className = 'filter-preset-btn';
                btn.dataset.b = p.brightness; btn.dataset.sa = p.saturation; btn.dataset.c = p.contrast;
                btn.dataset.key = p.key || '';   // ★ 记录 key，供删除/匹配使用
                btn.innerHTML = `<span style="font-size:15px;line-height:1;flex:none">${p.icon}</span><span>${p.name}</span>`;
                // ★ 高亮判定：key 匹配优先，其次才按数值兜底
                if((p.key && p.key === activeKey) ||
                   (!activeKey && p.brightness===_curFilter.b && p.saturation===_curFilter.s && p.contrast===_curFilter.c)){
                    btn.classList.add('preset-active');
                }
                bindPresetClick(btn, p);
                box.appendChild(btn);
            });
            builtinHost.appendChild(box);
        }
        // ---- 自定义预设 ----
        if(customHost){
            const customs = getCustomPresets();
            customHost.innerHTML = '';
            customs.forEach(p=>{
                const btn = document.createElement('button');
                btn.className = 'filter-preset-btn cp-item';
                btn.dataset.b = p.brightness; btn.dataset.sa = p.saturation; btn.dataset.c = p.contrast;
                btn.dataset.key = p.key || '';
                btn.draggable = true;   // ★ 拖拽排序
                btn.innerHTML = `${p.icon} <span>${p.name}</span><span class="cp-del" title="删除该预设">×</span>`;
                // ★ 高亮判定：key 匹配优先，其次才按数值兜底
                if((p.key && p.key === activeKey) ||
                   (!activeKey && p.brightness===_curFilter.b && p.saturation===_curFilter.s && p.contrast===_curFilter.c)){
                    btn.classList.add('preset-active');
                }
                // ★ 删除（停止冒泡，不触发套用）
                const delEl = btn.querySelector('.cp-del');
                if(delEl){
                    delEl.addEventListener('click', e=>{
                        e.stopPropagation();
                        // ★ 删掉的若是当前选中的预设，同步清除选中态，避免残留高亮
                        if(getActivePresetKey() === p.key){ setActivePresetKey(''); }
                        removeCustomPreset(p.key);
                        renderPresets();
                        showFloatTip('已删除自定义预设「'+p.name+'」');
                    });
                }
                bindPresetClick(btn, p);
                // ★ 拖拽排序：拖拽过程 + 落点排序
                bindDragSort(btn, customs);
                customHost.appendChild(btn);
            });
            // 空状态提示
            if(cpEmpty){ cpEmpty.style.display = customs.length ? 'none' : 'block'; }
        }
        // ★ 我的预设 Tab 角标数量
        if(cpTabCount){ cpTabCount.textContent = String(getCustomPresets().length); }
        // ★ 每次重建预设后，同步刷新底部状态条
        renderPresetStatus();
    }
    // ★ 底部状态条：显示"当前正在使用哪个预设"+ 成功提示
    //   纯展示层，不持有状态；所有状态从 getActivePresetKey / _curFilter / 自定义列表 推导。
    const statusEl = mask.querySelector('#filter-preset-status');
    let _statusTimer = null;   // 成功提示的自动还原计时器
    function renderPresetStatus(){
        if(!statusEl) return;
        const cur = { b:_curFilter.b, s:_curFilter.s, c:_curFilter.c };
        // 优先按持久化的 key 定位预设，其次按数值兜底
        let preset = null;
        const activeKey = getActivePresetKey();
        if(activeKey){
            preset = FILTER_PRESETS.find(p => p.key === activeKey)
                  || getCustomPresets().find(p => p.key === activeKey)
                  || null;
        }
        if(!preset){
            preset = FILTER_PRESETS.find(p => p.brightness===cur.b && p.saturation===cur.s && p.contrast===cur.c)
                  || getCustomPresets().find(p => p.brightness===cur.b && p.saturation===cur.s && p.contrast===cur.c)
                  || null;
        }
        // 防抖：成功提示期间不覆盖文案，只更新颜色
        const keeping = statusEl.classList.contains('is-toast') && _statusTimer;
        statusEl.classList.toggle('is-none', !preset);
        if(!preset){
            statusEl.innerHTML = `<span class="fps-icon">🎨</span><span>当前为<b class="fps-name">自定义参数</b>，未套用任何预设</span>`
                              + `<span class="fps-values">（${cur.b}% / ${cur.s}% / ${cur.c}%）</span>`;
            if(!keeping){ clearToast(); }
            return;
        }
        const tag = FILTER_PRESETS.some(p => p.key === preset.key) ? '内置' : '我的';
        if(!keeping){
            statusEl.innerHTML =
                `<span class="fps-icon">${preset.icon}</span>`
              + `<span class="fps-label">当前使用</span>`
              + `<span class="fps-name">${preset.name}</span>`
              + `<span class="fps-label">（${tag}）</span>`
              + `<span class="fps-values">${cur.b}% / ${cur.s}% / ${cur.c}%</span>`;
        }
    }
    // ★ 成功提示：短暂切换为绿色 toast，1.6 秒后还原为当前预设
    function flashPresetStatus(preset){
        if(!statusEl) return;
        clearToast();
        const tag = FILTER_PRESETS.some(p => p.key === preset.key) ? '内置' : '我的';
        statusEl.classList.remove('is-none');
        statusEl.classList.add('is-toast');
        statusEl.innerHTML =
            `<span class="fps-icon">✅</span>`
          + `<span class="fps-name">已套用「${preset.name}」</span>`
          + `<span class="fps-label">（${tag}预设）</span>`;
        _statusTimer = setTimeout(()=>{
            statusEl.classList.remove('is-toast');
            renderPresetStatus();   // ★ 还原为常规状态文案
            _statusTimer = null;
        }, 1600);
    }
    function clearToast(){
        if(_statusTimer){ clearTimeout(_statusTimer); _statusTimer = null; }
        statusEl.classList.remove('is-toast');
    }
    // ★ 拖拽排序：通过 HTML5 dragstart / dragover / drop 实现，落点后持久化新顺序
    let dragKey = null;
    function bindDragSort(btn, customs){
        btn.addEventListener('dragstart', e=>{
            dragKey = btn.dataset.key || null;
            btn.classList.add('cp-dragging');
            try{ e.dataTransfer.setData('text/plain', dragKey || ''); }catch(err){}
        });
        btn.addEventListener('dragend', ()=>{ btn.classList.remove('cp-dragging'); dragKey = null; });
        btn.addEventListener('dragover', e=>{
            e.preventDefault();
            if(dragKey && dragKey !== btn.dataset.key) btn.classList.add('cp-drag-over');
        });
        btn.addEventListener('dragleave', ()=>{ btn.classList.remove('cp-drag-over'); });
        btn.addEventListener('drop', e=>{
            e.preventDefault();
            e.stopPropagation();
            btn.classList.remove('cp-drag-over');
            const overKey = btn.dataset.key;
            if(!dragKey || !overKey || dragKey === overKey) return;
            const keys = customs.map(p => p.key);
            const fromIdx = keys.indexOf(dragKey);
            const toIdx   = keys.indexOf(overKey);
            if(fromIdx < 0 || toIdx < 0) return;
            keys.splice(toIdx, 0, keys.splice(fromIdx, 1)[0]);  // 移动
            reorderCustomPresets(keys);   // ★ 持久化新顺序
            renderPresets();
        });
    }
    renderPresets();
    // ★ 选择夹切换：快捷预设 / 我的预设
    const cpTabs = mask.querySelectorAll('.cp-tab');
    const cpBuiltinPanel = mask.querySelector('.cp-panel-builtin');
    const cpCustomPanel  = mask.querySelector('.cp-panel-custom');
    cpTabs.forEach(tab=>{
        tab.addEventListener('click', ()=>{
            const which = tab.dataset.cpTab;
            cpTabs.forEach(t=>t.classList.toggle('cp-tab-active', t === tab));
            if(cpBuiltinPanel){ cpBuiltinPanel.style.display = which === 'builtin' ? '' : 'none'; }
            if(cpCustomPanel){  cpCustomPanel.style.display  = which === 'custom'  ? '' : 'none'; }
        });
    });
    // ==================== ★ 自定义预设：图标选择 + 数值联动 + 保存 ====================
    const iconPick = mask.querySelector('#cp-icon-pick');
    const nameInput = mask.querySelector('#cp-name');
    const saveBtn = mask.querySelector('#cp-save-btn');
    const curBEl = mask.querySelector('#cp-cur-b');
    const curSEl = mask.querySelector('#cp-cur-s');
    const curCEl = mask.querySelector('#cp-cur-c');
    let chosenIcon = CUSTOM_PRESET_ICONS[0];
    // ★ 渲染图标选择器（单选高亮，默认选中第一个）
    if(iconPick){
        CUSTOM_PRESET_ICONS.forEach(ic=>{
            const opt = document.createElement('div');
            opt.className = 'cp-icon-opt' + (ic === chosenIcon ? ' cp-icon-active' : '');
            opt.textContent = ic;
            opt.addEventListener('click', ()=>{
                chosenIcon = ic;
                iconPick.querySelectorAll('.cp-icon-opt').forEach(o=>o.classList.remove('cp-icon-active'));
                opt.classList.add('cp-icon-active');
            });
            iconPick.appendChild(opt);
        });
    }
    // ★ 实时同步"将保存当前数值"显示（基于当前生效值 _curFilter，与滑块/预设点击同步）
    const syncCpCurrent = ()=>{
        const b = _curFilter.b, s = _curFilter.s, c = _curFilter.c;
        if(curBEl) curBEl.textContent = b + '%';
        if(curSEl) curSEl.textContent = s + '%';
        if(curCEl) curCEl.textContent = c + '%';
    };
    // 滑块拖动时更新当前值 + 同步"将保存当前数值"显示
    [brRange, saRange, coRange].forEach(el=>{
        if(el){ el.addEventListener('input', ()=>{ refreshFilter(); syncCpCurrent(); });
                el.addEventListener('change', ()=>{ refreshFilter(); syncCpCurrent(); }); }
    });
    syncCpCurrent();
    // ★ 保存按钮：把当前数值 + 自定义名字 + 图标 存为一条我的预设
    if(saveBtn){
        saveBtn.addEventListener('click', ()=>{
            const name = (nameInput ? nameInput.value : '').trim();
            if(!name){
                showFloatTip('请先输入预设名称~');
                if(nameInput) nameInput.focus();
                return;
            }
            const b = Math.max(0, Math.min(200, _curFilter.b));
            const s = Math.max(0, Math.min(200, _curFilter.s));
            const c = Math.max(0, Math.min(200, _curFilter.c));
            const item = addCustomPreset({ name, icon: chosenIcon, brightness:b, saturation:s, contrast:c });
            flashPresetStatus(item);                  // ★ 底部状态条弹出"已套用"成功提示
            showFloatTip('已保存自定义预设「'+name+'」🎨');
            if(nameInput) nameInput.value = '';      // 清空输入框，方便继续添加
            // ★ 保存后这条就是当前选中的预设，持久化记录下来
            setActivePresetKey(item.key || '');
            renderPresets();                          // ★ 重建预设列表，新预设立即出现（自带高亮）
            // 自动高亮刚保存的那条
            const just = filterPanel.querySelector(`.filter-preset-btn[data-key="${item.key}"]`);
            if(just){
                filterPanel.querySelectorAll('.filter-preset-btn').forEach(x=>x.classList.remove('preset-active'));
                just.classList.add('preset-active');
            }
            // ★ 保存后自动切到「我的预设」面板，让用户立刻看到成果
            const customTab = mask.querySelector('.cp-tab[data-cp-tab="custom"]');
            if(customTab) customTab.click();
        });
    }
    // ★ 删除"当前激活"的自定义预设（数值与当前滑块一致的那个）
    const delCurrentBtn = mask.querySelector('#cp-del-current');
    if(delCurrentBtn){
        delCurrentBtn.addEventListener('click', ()=>{
            const match = removeCurrentCustomPreset(curMatch());
            if(!match){
                showFloatTip('当前数值没有匹配的自定义预设~');
                return;
            }
            if(!confirm('确定删除自定义预设「'+match.name+'」？')) return;
            renderPresets();
            renderPresetStatus();   // ★ 删除后当前预设已不存在，同步刷新状态条
            showFloatTip('已删除当前预设「'+match.name+'」');
        });
    }
    // ★ 导出：把我的预设序列化为 JSON 并触发下载
    const exportBtn = mask.querySelector('#cp-export');
    if(exportBtn){
        exportBtn.addEventListener('click', ()=>{
            const data = exportCustomPresets();
            if(!data.length){ showFloatTip('暂无可导出的预设~'); return; }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const now = new Date();
            const pad = n => String(n).padStart(2,'0');
            a.href = url;
            a.download = `好好看-画面预设-${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(()=>{ URL.revokeObjectURL(url); }, 1000);
            showFloatTip('已导出 '+data.length+' 条预设 📤');
        });
    }
    // ★ 导入：读取 JSON 文件，合并进我的预设（自动去重，不覆盖现有）
    const importFile = mask.querySelector('#cp-import-file');
    if(importFile){
        importFile.addEventListener('change', e=>{
            const file = e.target.files && e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = ()=>{
                try{
                    const parsed = JSON.parse(String(reader.result || ''));
                    const items = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.presets) ? parsed.presets : null);
                    if(!items){ showFloatTip('文件格式不正确~'); return; }
                    const added = importCustomPresets(items);
                    renderPresets();
                    showFloatTip('已导入 '+added+' 条预设 📥');
                    // ★ 导入后自动切到「我的预设」面板
                    const customTab = mask.querySelector('.cp-tab[data-cp-tab="custom"]');
                    if(customTab) customTab.click();
                }catch(err){
                    showFloatTip('导入失败：文件解析错误~');
                    console.warn('[预设导入] ⚠️', err);
                }finally{
                    importFile.value = '';   // 清空，便于再次选同一文件
                }
            };
            reader.onerror = ()=>{ showFloatTip('导入失败：无法读取文件~'); importFile.value = ''; };
            reader.readAsText(file);
        });
    }
    // ==================== 自定义预设逻辑结束 ====================
    // ★ 抽取「读取当前控件值 → 落地到 localStorage → 即时应用到所有 video」的通用函数，
    //   各控件（画面比例/跳过片头片尾/倍速/画面调节滑块/预设）在改变时都调用它，
    //   做到「点击即生效、无需保存按钮」。
    const clampPct2 = v => Math.max(0, Math.min(200, parseInt(v,10)||0));
    const commitSettings = ()=>{
        const fitBtn = mask.querySelector('.fit-buttons:not(#rate-buttons) button.fit-active');
        const fit = fitBtn ? fitBtn.dataset.fit : 'default';
        const intro = Math.max(0, Math.min(900, parseInt(introRange?introRange.value:0,10)||0));
        const outro = Math.max(0, Math.min(900, parseInt(outroRange?outroRange.value:0,10)||0));
        const rateBtn = mask.querySelector('#rate-buttons button.fit-active');
        const rate = rateBtn ? (parseFloat(rateBtn.dataset.rate) || 1) : 1;
        // ★ 音量：实时读取滑块（存在即读），0~100 保护
        const volRange = mask.querySelector('#vol-range');
        const vol = volRange ? Math.max(0, Math.min(100, parseInt(volRange.value,10)||0)) : setting.volume;
        // ★ 影片亮度：常规页滑块与画面调节页滑块双向同步同一数值
        const genBrRange = mask.querySelector('#gen-brightness-range');
        let brightness;
        if(genBrRange){ brightness = clampPct2(genBrRange.value); }
        else { brightness = clampPct2((brRange ? brRange.value : _curFilter.b) ?? setting.brightness); }
        const saturation = clampPct2((saRange ? saRange.value : _curFilter.s) ?? setting.saturation);
        const contrast   = clampPct2((coRange ? coRange.value : _curFilter.c) ?? setting.contrast);
        savePlayerSettings({videoFit:fit, skipIntro:intro, skipOutro:outro, playbackRate:rate,
                            volume:vol, brightness, saturation, contrast});
        document.querySelectorAll('video').forEach(v=>{
            if(!v.closest || !v.closest('#local-player-mask')){
                applyVideoFit(v, fit);
                applyPlaybackRate(v, rate);
                applyVideoFilter(v);
                applyVolume(v, vol);  // ★ 实时同步音量
            }
        });
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
// ====================================================================
// ★★★ 侧边栏定制模块：header logo + 菜单项屏蔽/排序 ★★★
// --------------------------------------------------------------------
// 需求（针对页面原始 DOM：div.t-p > div.t-p-side）：
//   ① header logo 链接 → 改成「好好看」并带 LOGO；
//   ② 屏蔽 ul:nth-child(5) 下的 li:nth-child(4) 与 li:nth-child(6)；
//   ③ 把 li:nth-child(5) 移到 li:nth-child(4) 之前的位置。
// 手段：CSS 兜底 + 节点操作 + MutationObserver 兜底（防 SPA 重绘/重建）。
// 全部由下方开关集中控制，不需要时整体关掉即可。
// ====================================================================
const HHKAN_SIDE = {
    enabled: true,                 // ★ 总开关：false 即完全停用本模块
    logoText: '好好看',          // ★ logo 文字（可改）
    logoEmoji: '🐻',              // ★ logo 图标（可换为 <img>，见下方 LOGO_URL）
    // ★ 若想用图片 LOGO，把下方 URL 填上即可；为空则使用 emoji + 文字
    logoImageUrl: '',              // 例：'https://www.hhkan0.com/static/logo.png'
    hideLi4: true,                 // 屏蔽 li:nth-child(4)
    hideLi6: true,                 // 屏蔽 li:nth-child(6)
    moveLi5BeforeLi4: true,        // 把 li:nth-child(5) 移到 li:nth-child(4) 之前
};
const SIDE_CSS_ID = 'hhkan-side-style';
// 各选择器（集中维护，改一处全站生效）
const SEL = {
    side:     'body > div.t-p > div.t-p-side',
    headerA:  'body > div.t-p > div.t-p-side > div > div.header.flex-center > a',
    li4:      'body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(4)',
    li5:      'body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(5)',
    li6:      'body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(6)',
    // ★ 底部 footer logo（与侧边栏 header logo 文案/图标保持完全一致）
    footerLogoA: 'body > div.t-p > div.t-p-main > div.footer > div.footer-item.footer-item-1 > div.logo-wrap.fs-margin-left > a',
};
let _sideInited = false;

function applySideCustom(){
    if(!HHKAN_SIDE.enabled) return;
    try{
        // ========== ① header logo → 「影视空间」带 LOGO ==========
        const logoA = document.querySelector(SEL.headerA);
        if(logoA && !logoA.dataset.hhkanLogoDone){
            // 保留原链接跳转：仅替换内部可见内容，不改 href
            logoA.innerHTML = '';
            // LOGO 图标（图片优先，否则 emoji）
            if(HHKAN_SIDE.logoImageUrl){
                const img = document.createElement('img');
                img.className = 'hhkan-side-logo';
                img.src = HHKAN_SIDE.logoImageUrl;
                img.alt = HHKAN_SIDE.logoText;
                logoA.appendChild(img);
            }else{
                const icon = document.createElement('span');
                icon.className = 'hhkan-side-logo-icon';
                icon.textContent = HHKAN_SIDE.logoEmoji;
                logoA.appendChild(icon);
            }
            // 站点名「好好看」
            const txt = document.createElement('span');
            txt.className = 'hhkan-side-logo-text';
            txt.textContent = HHKAN_SIDE.logoText;
            logoA.appendChild(txt);
            logoA.dataset.hhkanLogoDone = '1';
        }

        // ========== ② 屏蔽 li:nth-child(4) 与 li:nth-child(6) ==========
        if(HHKAN_SIDE.hideLi4){ const el = document.querySelector(SEL.li4); if(el && el.parentNode) el.remove(); }
        if(HHKAN_SIDE.hideLi6){ const el = document.querySelector(SEL.li6); if(el && el.parentNode) el.remove(); }

        // ========== ③ 把 li:nth-child(5) 移到 li:nth-child(4) 之前 ==========
        if(HHKAN_SIDE.moveLi5BeforeLi4){
            const li4 = document.querySelector(SEL.li4);
            const li5 = document.querySelector(SEL.li5);
            // 注意：若 hideLi4=true，li4 已被移除，此时 li5 前面已无第4项，
            //       「移到第4之前」退化为「作为列表第一项（insertBefore 第一个 li）」
            if(li5 && li5.parentNode){
                const firstLi = li5.parentNode.querySelector('li:first-child');
                if(li4 && li4.parentNode === li5.parentNode){
                    li5.parentNode.insertBefore(li5, li4);      // 插到第4之前
                }else if(firstLi && firstLi !== li5){
                    li5.parentNode.insertBefore(li5, firstLi);  // li4已屏蔽 → 置顶
                }
            }
        }
        // ========== ④ footer logo 与侧边栏 header logo 保持一致 ==========
        const footLogoA = document.querySelector(SEL.footerLogoA);
        if(footLogoA && !footLogoA.dataset.hhkanFootLogoDone){
            footLogoA.innerHTML = '';
            // 与侧边栏完全一致：图片优先，否则 emoji
            if(HHKAN_SIDE.logoImageUrl){
                const img = document.createElement('img');
                img.className = 'hhkan-side-logo';
                img.src = HHKAN_SIDE.logoImageUrl;
                img.alt = HHKAN_SIDE.logoText;
                footLogoA.appendChild(img);
            }else{
                const icon = document.createElement('span');
                icon.className = 'hhkan-side-logo-icon';
                icon.textContent = HHKAN_SIDE.logoEmoji;
                footLogoA.appendChild(icon);
            }
            const txt = document.createElement('span');
            txt.className = 'hhkan-side-logo-text';
            txt.textContent = HHKAN_SIDE.logoText;
            footLogoA.appendChild(txt);
            footLogoA.dataset.hhkanFootLogoDone = '1';
        }
    }catch(e){
        console.warn('[侧边栏定制] 执行异常：', e);
    }
}

function initSideCustom(){
    if(_sideInited) return;
    _sideInited = true;

    // ---- CSS 兜底：即使节点被重建也强制生效（logo 样式 + 屏蔽项隐藏） ----
    if(!document.querySelector('#'+SIDE_CSS_ID)){
        const style = document.createElement('style');
        style.id = SIDE_CSS_ID;
        style.textContent = `
            /* logo：「好好看」带 LOGO 样式 */
            ${SEL.headerA}{display:inline-flex!important;align-items:center!important;gap:8px!important;
                text-decoration:none!important;font-weight:800!important;font-size:18px!important;color:inherit!important;}
            .hhkan-side-logo{height:28px;width:28px;object-fit:contain;border-radius:6px;vertical-align:middle;}
            .hhkan-side-logo-icon{font-size:24px;line-height:1;}
            .hhkan-side-logo-text{white-space:nowrap;}
            /* 屏蔽项：永久隐藏（防重建兜底） */
            ${HHKAN_SIDE.hideLi4 ? SEL.li4+'{display:none!important;}' : ''}
            ${HHKAN_SIDE.hideLi6 ? SEL.li6+'{display:none!important;}' : ''}
            /* ★ footer logo 与侧边栏 header logo 保持一致（文案 + 图标） */
            ${SEL.footerLogoA}{display:inline-flex!important;align-items:center!important;gap:8px!important;
                text-decoration:none!important;font-weight:800!important;font-size:18px!important;color:inherit!important;}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // ---- 立即执行一次（DOM 可能已就绪） ----
    applySideCustom();

    // ---- MutationObserver 兜底：侧边栏重建/路由切换后自动重应用 ----
    try{
        const sideEl = document.querySelector(SEL.side) || document.body;
        const obs = new MutationObserver(()=>{ applySideCustom(); });
        obs.observe(sideEl, { childList: true, subtree: true });
    }catch(e){ /* 忽略 */ }

    console.log('[侧边栏定制] ✅ 已启用：logo→好好看 / 屏蔽li4·li6 / li5置前 / footer-logo同步');
}

// ★ 在 DOM 就绪后启动（与全文件 waitDomReady 保持一致）
waitDomReady(initSideCustom);
// ====================================================================


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
// ==================== ★ 更新公告（原「使用声明」改造）========================
// 版本号：升级版本号后，已读过旧版本的用户下次会自动再次弹出公告
const UPDATE_NOTICE = {
    version: "v0.0.6",
    title: "更新公告 · v0.0.6",
    subTitle: "🎉 好好看v0.0.6 更新日志",
    // 本次更新内容（按 1、2、3… 竖列自动排序，渲染时自动加序号）
    // 每条格式：["标签", "图标", "正文"] —— 顺序即序号，调整顺序即可重排
    changes: [
        ["优化", "📤", "优化「继续观看」导出功能：支持自定义保存位置与自定义文件名，默认文件名自动附带日期时间，导出完成后弹出精美结果弹窗（含光圈动画与彩色粒子效果）"],
        ["优化", "📥", "优化「继续观看」导入功能：导入完成后弹出精美结果弹窗，清晰展示新增 / 更新条数；格式错误时也有专门的失败提示弹窗"],
        ["新增", "👤", "账号装饰信息（头像 / 背景图 / 昵称 / 昵称颜色）现已完美实现：自动与站点登录 / 登出表单同步，退出登录时保存装饰到当前账号，再次登录同账号自动恢复，换账号不串装饰、同账号重登还原如初"],
        ["修复", "🌙", "彻底修复默认黑夜模式下重进 App 时每日推荐 / 继续观看 / 全局设置 / 播放设置四个弹窗全部变成白天模式白底的 BUG：启动阶段即预注入深色样式（纯黑兜底 + 完整样式双重保障），全程跟随黑夜主题，只有主动切换到白天模式时才会变白"],
        ["优化", "💡", "优化「快进 / 后退步长（秒）」输入框：聚焦时弹出提示条，说明「填 0 或不填 = 使用默认 10 秒，叠加即在当前秒数基础上再增加」，不再困惑默认值规则"],
        ["新增", "📤", "新增「继续观看」记录的导入与导出功能：可把详细的影片观看进度（含影片名 / 播放地址 / 集数 / 总集数 / 当前播放时间 / 进度百分比 / 更新时间）导出为文件备份，换设备时一键导入恢复"],
    ],
    footer: "打包仅限个人使用，请勿传播或商业用途，否则后果自负。"
};
// 弹窗是否需要在本次会话展示：
//  1) 首次进入（未确认过任何版本）一定展示；
//  2) 已确认过、但版本号比已记录的版本新 → 视为「有更新」，自动再弹；
//  3) 同一版本已确认过 → 本会话不再弹（sessionStorage 控制）。
function shouldShowUpdateNotice(){
    try{
        const seen = JSON.parse(localStorage.getItem("pake_notice_seen") || "{}");
        // 从未确认过任何版本（首次启动）→ 一定展示
        if(!seen || !seen.version) return true;
        return String(seen.version) !== UPDATE_NOTICE.version;
    }catch(e){ return true; }
}
// ★ 是否在「本次软件启动」阶段（开屏动画结束前不弹，避免与开屏动画重叠）
function isAppBooted(){ return document.readyState === 'complete'; }
// ★ 首次启动弹窗：软件启动时检测一次，满足「首次 + 未在本会话确认」即弹出
function checkShowUpdateNoticeOnBoot(){
    if(sessionStorage.getItem("pake_session_ok") === "yes") return;   // 本会话已确认 → 不再弹
    if(!shouldShowUpdateNotice()) return;                              // 已读过同版本 → 不再弹
    if(document.querySelector("#pake-disclaimer-mask")) return;        // 已存在 → 不重复
    const maskDom = document.createElement('div');
    maskDom.id = "pake-disclaimer-mask";
    buildUpdateNotice(maskDom);
}
// ★ 生成公告 DOM（自动更新与任务栏按钮共用，避免两份重复代码）
function buildUpdateNotice(maskDom){
    // 组装更新内容列表：按 1、2、3… 竖列自动排序，自动加序号
    const changesHtml = UPDATE_NOTICE.changes
        .map((c, i) => {
            const idx = i + 1;                       // 序号：1、2、3…
            const tag = Array.isArray(c) ? c[0] : "";   // 标签：新增 / 优化 / 修复
            const icon = Array.isArray(c) ? c[1] : "";  // 图标
            const text = Array.isArray(c) ? c[2] : c;    // 正文
            return `<li>
                <span class="notice-num">${idx}</span>
                <span class="notice-tag notice-tag-${tag}">${icon}${tag}</span>
                <span class="notice-text">${text}</span>
            </li>`;
        }).join("");
    maskDom.innerHTML = `
        <div id="pake-disclaimer-box">
            <div class="notice-head">
                <div class="notice-head-left">
                    <h3>${UPDATE_NOTICE.title}</h3>
                    <p class="notice-sub">${UPDATE_NOTICE.subTitle || '本次更新带来了以下新功能与优化，欢迎体验 🎉'}</p>
                </div>
                <span class="notice-ver">${UPDATE_NOTICE.version}</span>
            </div>
            <div class="notice-scroll"><ul class="notice-changelog">${changesHtml}</ul></div>
            <div class="notice-foot">${UPDATE_NOTICE.footer}</div>
            <button id="pake-btn-confirm">我知道了</button>
        </div>
    `;
    document.body.appendChild(maskDom);
    maskDom.querySelector('#pake-disclaimer-box').addEventListener('click',e=>e.stopPropagation());
    document.querySelector('#pake-btn-confirm').addEventListener('click',(e)=>{
        e.stopPropagation();
        // 记录已读版本（持久化）+ 本会话不再弹（sessionStorage）
        try{
            localStorage.setItem("pake_notice_seen", JSON.stringify({ version: UPDATE_NOTICE.version }));
        }catch(err){}
        sessionStorage.setItem("pake_session_ok","yes");
        maskDom.remove();
    });
}
// ★ 对外暴露：供任务栏「更新公告」按钮随时调用（手动查看，不受版本/会话限制，已存在则不重复创建）
function showUpdateNotice(){
    if(document.querySelector("#pake-disclaimer-mask")) return;
    const maskDom = document.createElement('div');
    maskDom.id = "pake-disclaimer-mask";
    buildUpdateNotice(maskDom);
}
// ★ 暴露给任务栏事件代理（该函数在模块 IIFE 内，需显式挂到 window 中转）
try{ (window.__hhkanActions = window.__hhkanActions || {}).notice = showUpdateNotice; }catch(e){}
// ★ 软件启动第一次：DOM 就绪后检测并弹出公告（若开屏动画正在播放，则等动画结束/页面加载完成后再弹，避免重叠）
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => {
        if(document.readyState === 'complete') checkShowUpdateNoticeOnBoot();
        else window.addEventListener('load', checkShowUpdateNoticeOnBoot, { once:true });
    }, { once:true });
}else if(document.readyState === 'complete'){
    checkShowUpdateNoticeOnBoot();
}else{
    window.addEventListener('load', checkShowUpdateNoticeOnBoot, { once:true });
}
// ====================================================================
// ★★★ 个人中心模块：修改头像 / 背景图 / 昵称 + 万张 AI 头像库 ★★★
// --------------------------------------------------------------------
// 需求：
//   ① profile-box 第3个 a 标签下方新增「修改资料」入口按钮；
//   ② 点击后，在 info-swiper 第4个 child 右侧滑出设置面板；
//   ③ 面板可：自定义上传电脑图片（头像 / 背景图）、从 AI 头像库挑选、
//      自定义昵称；
//   ④ 修改后同步更新：user-avatar 头像、profile-box 头像、昵称；
//   ⑤ 所有数据存 localStorage，刷新 / 重开网页不丢失。
// ====================================================================
const HHKAN_PROFILE = {
    enabled: true,
    // ★ 存储键（持久化到 localStorage）
    KEY_AVATAR:  'hhkan_profile_avatar',     // 头像（dataURL 或 url）
    KEY_BG:      'hhkan_profile_bg',         // 背景图
    KEY_NICK:    'hhkan_profile_nick',       // 昵称
    KEY_NICK_COLOR: 'hhkan_profile_nick_color', // ★ 优化二：昵称颜色（JSON：{mode,color1,color2,angle}）
    // ★ 默认头像 / 背景（未设置时的兜底）
    defaultAvatar: '🐻',
    defaultNick:  '好好看用户',
    // ★ AI 头像库：改用 DiceBear 公开 HTTP API（免登录、免 key、同 seed 出图稳定）
    //   地址规则：https://api.dicebear.com/10.x/{style}/svg?seed=xxx&backgroundColor=xxx
    //   支持 60+ 风格：adventurer / avataaars / bottts / pixel-art / lorelei /
    //   big-smile / fun-emoji / personas / miniavs / glass 等。
    avatarStyles: [
        { name: '冒险者',   icon: '🧙', style: 'adventurer',          bg: ['b6e3f4','c0aede','ffd5dc','d1d4f9'] },
        { name: '卡通人物', icon: '👧', style: 'avataaars',           bg: ['ffd5dc','b6e3f4','c0aede','d1d4f9'] },
        { name: '机器人',   icon: '🤖', style: 'bottts',              bg: ['d1d4f9','c0aede','b6e3f4','ffdfbf'] },
        { name: '像素风',   icon: '👾', style: 'pixel-art',            bg: ['ffd5dc','b6e3f4','c0aede','d1d4f9'] },
        { name: '唯美少女', icon: '🌸', style: 'lorelei',             bg: ['ffd5dc','f1f1f1','b6e3f4','c0aede'] },
        { name: '治愈笑脸', icon: '😊', style: 'big-smile',           bg: ['ffd5dc','b6e3f4','c0aede','d1d4f9'] },
        { name: '萌趣表情', icon: '🥳', style: 'fun-emoji',           bg: ['ffd5dc','b6e4f4','c0aede','ffdfbf'] },
        { name: '中性冒险', icon: '🧑', style: 'adventurer-neutral',  bg: ['b6e3f4','c0aede','ffd5dc','d1d4f9'] },
    ],
    // ★ 背景图库：彩色主题化壁纸（内嵌 · 不走第三方外链 · 不叠加 · 不重复）
    //   —— 优化二：每类重新规划为「主题化彩色壁纸」。每个分类自带一套 theme 主题：
    //      { c1, c2, accent, deco, emojis } 分别是主色 / 辅色 / 点缀色 / 装饰元素 / emoji 主角，
    //      生成时按分类专属配色 + 装饰 + 主角 emoji 拼出与该分类强相关的彩色壁纸，
    //      彻底解决「分类名是动漫、出的却是随机风景灰度图」的错位问题。
    //   seed 区间：12 类 × 50 张 = 600 张，基础段从 SEED_BASE 起连续排布；seg 为本类独占种子区间，
    //   分类之间种子绝不重叠，「换一批」在本类 50 张内不重复洗牌。
    //   分类对象：{ name, icon, seg:[start,end), theme:{...} }
    SEED_BASE: 30000,           // ★ 种子起点：避开与内置头像/其它模块的 seed 冲突
    PER_CAT: 50,               // ★ 每个分类固定出 50 张（不可叠加）
    PICSUM: 'https://picsum.photos',
    bgCategories: [
        // theme 字段说明：
        //   c1/c2   渐变主辅色（决定整体色系）  accent 装饰/光晕色  deco 装饰类型（circles/stars/grid/waves/sakura/hearts/geometric）
        //   emojis  画面主角 emoji（贴合该分类主题）        emojiSize emoji 基础字号
        { name:'星空宇宙', icon:'🌌', seg:[30000,30050], theme:{ c1:'#0f0c29', c2:'#302b63', accent:'#7f5cff', deco:'stars',    emojis:['🌟','🪐','🌙','☄️','🛸','🌠','🚀'], emojiSize:40 } },
        { name:'二次元动漫', icon:'🌸', seg:[30050,30100], theme:{ c1:'#ff9a9e', c2:'#fad0c4', accent:'#ff6fb5', deco:'sakura',   emojis:['🌸','💮','🌺','✨','🎀','🦋'],          emojiSize:34 } },
        { name:'梦幻少女', icon:'💖', seg:[30100,30150], theme:{ c1:'#a18cd1', c2:'#fbc2eb', accent:'#ff8fbf', deco:'hearts',   emojis:['💖','💗','🦄','🎀','🌷','🧸'],          emojiSize:34 } },
        { name:'自然风光', icon:'🌿', seg:[30150,30200], theme:{ c1:'#11998e', c2:'#38ef7d', accent:'#a8ff78', deco:'circles',  emojis:['🌿','🌲','🌳','🌺','🍃','🌻','🌵'],     emojiSize:32 } },
        { name:'海洋沙滩', icon:'🌊', seg:[30200,30250], theme:{ c1:'#2193b0', c2:'#6dd5ed', accent:'#5ad6ff', deco:'waves',    emojis:['🌊','🐚','🐬','🐠','🏖️','🦀','🌴'],     emojiSize:32 } },
        { name:'科技未来', icon:'🤖', seg:[30250,30300], theme:{ c1:'#0f2027', c2:'#2c5364', accent:'#00f2fe', deco:'grid',     emojis:['🤖','👾','🛸','💻','🔮','🛰️','⚡'],    emojiSize:32 } },
        { name:'游戏电竞', icon:'🎮', seg:[30300,30350], theme:{ c1:'#232526', c2:'#414345', accent:'#ff6b6b', deco:'grid',     emojis:['🎮','🕹️','👾','🎲','🏆','⚔️','🛡️'],      emojiSize:32 } },
        { name:'影视娱乐', icon:'🎬', seg:[30350,30400], theme:{ c1:'#1a1a2e', c2:'#16213e', accent:'#e94560', deco:'circles',  emojis:['🎬','🍿','🎤','🎭','🎷','📽️','🎟️'],     emojiSize:32 } },
        { name:'城市夜景', icon:'🌃', seg:[30400,30450], theme:{ c1:'#232526', c2:'#414345', accent:'#f5af19', deco:'grid',     emojis:['🌃','🏙️','🌉','🗽','🎆','🎇','🚕'],      emojiSize:32 } },
        { name:'动物萌宠', icon:'🐾', seg:[30450,30500], theme:{ c1:'#f7971e', c2:'#ffd200', accent:'#ff9f43', deco:'circles',  emojis:['🐾','🐱','🐶','🐰','🦊','🐼','🐨','🐯'], emojiSize:30 } },
        { name:'抽象艺术', icon:'🎨', seg:[30500,30550], theme:{ c1:'#7f5cff', c2:'#5ad6ff', accent:'#ffd93d', deco:'geometric',emojis:['🎨','🖼️','✨','🪄','💠','🎭'],          emojiSize:32 } },
        { name:'节日喜庆', icon:'🎉', seg:[30550,30600], theme:{ c1:'#ee0979', c2:'#ff6a00', accent:'#ffd93d', deco:'hearts',   emojis:['🎉','🎊','🎆','🎇','🥳','🎁','🎈'],     emojiSize:32 } },
    ],
    // 每类的主题主色（用于加载前占位底色 / 兜底图配色，随分类走，避免白块闪屏）
    catTint: {
        '星空宇宙':'#302b63', '二次元动漫':'#ff8fbf', '梦幻少女':'#fbc2eb', '自然风光':'#11998e',
        '海洋沙滩':'#2193b0', '科技未来':'#2c5364',  '游戏电竞':'#414345', '影视娱乐':'#1a1a2e',
        '城市夜景':'#232526', '动物萌宠':'#f7971e',  '抽象艺术':'#7f5cff', '节日喜庆':'#ee0979'
    },
    // 单页展示数量（每个分类固定出 50 张，刷新按钮换一批）
    perPage: 50,
    // ★ 使用记录（历史记录）存储键：记录「我设为头像/背景」的图片
    KEY_HISTORY: 'hhkan_profile_history',
};
// 头像库标注数量（DiceBear 为算法生成，实际无限，此处仅作展示用）
const AI_TOTAL = 9999;

// ==================== 随机昵称库（网名 + 风格 / 调性 / 元素 三维分类）====================
// ★ 优化二：在原有 6 种风格基础上扩充为「7 风格 × 8 调性 × 7 元素」三级筛选，
//   默认一次展示 100 个候选（NICK_BATCH），点哪个用哪个，无需先"生成"。
//
//   维度说明：
//   ① 风格（style，控制整体气质）
//      中文意境 / 中英文混搭 / 英文单词 / 数字组合 / 符号装饰 / 古风国风 / 二次元可爱
//   ② 调性（mood，控制名称给人的感受）
//      清冷自由 / 轻松日常 / 复古文艺 / 极简高级 / 古典诗意 / 可爱元气 / 个性张扬 / 极简随机
//   ③ 元素（elem，控制构成成分）
//      中文 / 英文 / 数字 / 符号 / 可爱后缀 / 古风词 / 情绪意象
//
//   长度随风格自动适配：2～10 字不等（古风国风偏长、极简英文偏短）。
//
//   每组配置：pre 前缀词库 / mid 中缀词库 / suf 后缀词库 / len 目标长度档位
//   （len='s' 短2-4 / 'm' 中4-6 / 'l' 长6-10），生成器按档位自动截断拼接。
const HHKAN_NICK_STYLES = [
    {
        name: '中文意境', icon: '🀄',
        pre: ['清风','明月','落花','烟雨','云归','浅夏','北城','江南','故里','青梅','折扇','听雨','拾光','渡口','余温','远山','薄雾','晨曦','迟暮','清欢','浮生','长街','旧巷','南风','北柠'],
        mid: ['','未','入','醉','忆','听','挽','渡','辞','惜','赋','叹','揽','抚','望','与','和','的','过','寻','借','赠','记','念'],
        suf: ['客','人','归','愁','梦','月','雪','霜','酒','书','尘','弦','灯','舟','城','夏','秋','海','山','风','云'],
        len: 'l',
    },
    {
        name: '中英文混搭', icon: '🔤',
        pre: ['Star','Moon','Wind','Fire','Sky','Sea','Neon','Echo','Zero','Aurora','Luna','Kaze','Yue','Cloud','Night'],
        mid: ['','_','-','的','之','小','丶','X','Z'],
        suf: ['少年','物语','手札','日记','物语','酱','sama','先生','小姐','君','Notes','Story','Days','Boy','Girl'],
        len: 'm',
    },
    {
        name: '英文单词', icon: '🔡',
        pre: ['Neon','Nova','Apex','Nyx','Echo','Flux','Hyper','Orbit','Sigma','Vertex','Onyx','Pixel','Aurora','Lumen','Zephyr'],
        mid: ['','_','-','X','Z','V','7','9','0','1','Alpha','Core','Net','Bit','Byte'],
        suf: ['','Sys','OS','AI','Bot','Link','Node','Wave','Grid','Forge','Hack','Data','Drone','Chip','Shell','Lab'],
        len: 's',
    },
    {
        name: '数字组合', icon: '🔢',
        pre: ['Zero','One','V1','No','ID','R','MK','Pt','Vol','Lv','Ver','7','9','0','X'],
        mid: ['','_','-','0','1','2','3','7','9','.','·'],
        suf: ['77','404','2024','521','1314','99','07','21','365','1999','2025','Zero','One'],
        len: 's',
    },
    {
        name: '符号装饰', icon: '✨',
        pre: ['★','♡','☾','✦','♪','☁','☘','♛','✿','❀','♞','☯','웃','♔','✌'],
        mid: ['','·','_','-','。','丶','*','~','×','÷'],
        suf: ['✦','♡','☾','♪','✿','♛','☘','☯','웃','★','·','~'],
        len: 's',
    },
    {
        name: '古风国风', icon: '🏯',
        pre: ['青衫','墨染','白衣','折扇','半盏','云归','浅夏','故里','江南','北城','烟雨','落花','长安','洛阳','姑苏','锦瑟','霜序','南风','听雪','煮酒','抚琴'],
        mid: ['','未','入','醉','忆','听','挽','渡','辞','惜','赋','叹','揽','抚','望','与','和','的','见','入','过','寻','借','赠','拾','记','念'],
        suf: ['客','人','归','愁','梦','月','雪','霜','酒','书','尘','弦','灯','舟','辞','生','年','时','期','缘','知','意'],
        len: 'l',
    },
    {
        name: '二次元/可爱', icon: '🌸',
        pre: ['樱花','喵酱','星野','月见','兔耳','魔法','糖分','棉花','柠檬','草莓','奶芙','初音','夜兔','夏目','琥珀','奶糖','泡芙','糯米','团子','啾咪','奶盖','芋泥','桃桃','葡萄','布丁','棉花','奶昔','麻薯'],
        mid: ['','小','酱','君','','','大人','殿','丸','子','太郎','子','姬','sama','chan'],
        suf: ['','少女','少年','使魔','骑士','魔女','天使','恶魔','勇者','妖精','占卜师','管家','巫女','剑客','歌姬','酱','子','君','太郎','sama'],
        len: 'm',
    },
];

// ★ 调性表：决定命名时的「情绪倾向」词库与长度偏好；
//   筛选时与风格正交组合——同一风格可叠加不同调性词库，进一步细分气质。
const HHKAN_NICK_MOODS = [
    { name:'清冷自由', icon:'🍃', words:['清','远','野','风','云','北','夜','孤','默','离','浮','游'] },
    { name:'轻松日常', icon:'🌤️', words:['午','阳','茶','闲','懒','暖','光','软','微','晴','糖','笑'] },
    { name:'复古文艺', icon:'📻', words:['旧','信','诗','书','巷','岁','影','胶片','旧梦','墨','迟','渡'] },
    { name:'极简高级', icon:'⚪', words:['O','N','L','X','V','A','壹','贰','极','简','净','白'] },
    { name:'古典诗意', icon:'📜', words:['诗','酒','月','琴','赋','墨','辞','长安','锦瑟','霜','雪','江南'] },
    { name:'可爱元气', icon:'🍬', words:['糖','甜','软','萌','圆','泡','喵','汪','啾','酱','桃','莓'] },
    { name:'个性张扬', icon:'🔥', words:['狂','锋','刃','焰','X','V','暗','夜','孤','野','绝','肆'] },
    { name:'极简随机', icon:'🎲', words:[] },
];

// ★ 元素表：控制名称的构成成分开关；
//   'text'(中文) / 'en'(英文) / 'num'(数字) / 'sym'(符号) / 'suffix'(可爱后缀) / 'gufeng'(古风词) / 'mood'(情绪意象)
const HHKAN_NICK_ELEMS = [
    { key:'text',    name:'中文',   icon:'🈶' },
    { key:'en',      name:'英文',   icon:'🔡' },
    { key:'num',     name:'数字',   icon:'🔢' },
    { key:'sym',     name:'符号',   icon:'✨' },
    { key:'suffix',  name:'可爱后缀', icon:'🌸' },
    { key:'gufeng',  name:'古风词', icon:'🏯' },
    { key:'mood',    name:'情绪意象', icon:'🌙' },
];

// 兼容旧代码引用（HHKAN_NICK_GROUPS 为旧名，避免其它文件引用时报错）
const HHKAN_NICK_GROUPS = HHKAN_NICK_STYLES;

// ---- 选择器集中维护 ----
const PROFILE_SEL = {
    // 入口挂载点：profile-box > div > div:nth-child(1) > a:nth-child(3)
    entryPoint: 'body > div.t-p > div.t-p-main > div.header > div.profile-box.fs-margin-section-right > div > div:nth-child(1)',
    // info-swiper 第4个 child（面板插到它右边）
    swiper4:   '#info-swiper > div > div:nth-child(4)',
    // user-avatar（头像展示）
    userAvatar: 'body > div.t-p > div.t-p-main > div.main > div.user-box.fs-margin-section > div > div.user-avatar',
    // 需要同步更新头像的其他位置（profile-box 内的头像 img）
    profileAvatars: 'body > div.t-p > div.t-p-main > div.header > div.profile-box.fs-margin-section-right img, body > div.t-p > div.t-p-main > div.header > div.profile-box.fs-margin-section-right .avatar',
    // 昵称容器
    userNick:  'body > div.t-p > div.t-p-main > div.main > div.user-box.fs-margin-section > div > div.user-info.fs-margin-top.fs-margin-bottom > div',
    profileNick:'body > div.t-p > div.t-p-main > div.header > div.profile-box.fs-margin-section-right .nick, body > div.t-p > div.t-p-main > div.header > div.profile-box.fs-margin-section-right .name',
    // 「修改资料」内嵌模式：页面中的用户中心容器（header = 选择夹，main = 内容区）
    userCenter:      'body > div.t-p > div.t-p-main > div.main > div.user-container.fs-margin-section',
    userCenterHeader:'body > div.t-p > div.t-p-main > div.main > div.user-container.fs-margin-section > div.user-container-header',
    userCenterMain:  'body > div.t-p > div.t-p-main > div.main > div.user-container.fs-margin-section > div.user-container-main.fs-margin-top',
};

let _profileInited = false;
let _profilePanelOpen = false;

// ==================== 数据存取 ====================
function _getProfile(){
    let avatar = '', bg = '', nick = HHKAN_PROFILE.defaultNick;
    try{
        avatar = localStorage.getItem(HHKAN_PROFILE.KEY_AVATAR) || '';
        bg     = localStorage.getItem(HHKAN_PROFILE.KEY_BG) || '';
        nick   = localStorage.getItem(HHKAN_PROFILE.KEY_NICK) || HHKAN_PROFILE.defaultNick;
    }catch(e){}
    return { avatar, bg, nick };
}
function _setAvatar(v){ try{ localStorage.setItem(HHKAN_PROFILE.KEY_AVATAR, v); }catch(e){} }
function _setBg(v){ try{ localStorage.setItem(HHKAN_PROFILE.KEY_BG, v); }catch(e){} }
function _setNick(v){ try{ localStorage.setItem(HHKAN_PROFILE.KEY_NICK, v); }catch(e){} }

// ==================== 昵称颜色（优化二：纯色 / 渐变色）====================
// 存储结构：{ mode:'solid'|'gradient', color1:'#hex', color2:'#hex', angle:deg }
const NICK_COLOR_DEFAULT = { mode:'solid', color1:'#ffffff', color2:'#a78bfa', angle:90 };
function _getNickColor(){
    try{
        const raw = localStorage.getItem(HHKAN_PROFILE.KEY_NICK_COLOR);
        if(!raw) return Object.assign({}, NICK_COLOR_DEFAULT);
        const o = JSON.parse(raw);
        return Object.assign({}, NICK_COLOR_DEFAULT, o || {});
    }catch(e){ return Object.assign({}, NICK_COLOR_DEFAULT); }
}
function _setNickColor(cfg){
    try{ localStorage.setItem(HHKAN_PROFILE.KEY_NICK_COLOR, JSON.stringify(cfg)); }catch(e){}
}
// 生成可应用到昵称元素的 CSS 字符串（含 -webkit-background-clip 渐变兼容）
function _nickColorCss(cfg){
    cfg = cfg || _getNickColor();
    if(cfg.mode === 'gradient'){
        const a = Number(cfg.angle) || 90;
        const c1 = cfg.color1 || '#ffffff';
        const c2 = cfg.color2 || '#a78bfa';
        return 'background-image:linear-gradient(' + a + 'deg,' + c1 + ',' + c2 + ');' +
               '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;';
    }
    const c = cfg.color1 || '#ffffff';
    return 'color:' + c + '!important;-webkit-text-fill-color:' + c + ';background-image:none;background-clip:border-box;';
}
// 取一个与给定色形成对比的颜色，用于渐变"颜色二"自动补色
function _contrastColor(hex){
    const h = (hex || '').replace('#','');
    if(h.length !== 6) return '#7f5cff';
    const r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
    // 亮度
    const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    if(lum > 0.6) return '#4d96ff';      // 浅色配蓝
    if(lum < 0.35) return '#ffd93d';     // 深色配金黄
    return '#ff6fb5';                    // 中间调配粉
}

// ==================== 昵称字体颜色 / 渐变色（优化二）====================
// 通用绑定函数：可同时服务「抽屉版」(mask 为抽屉面板) 与「内嵌版」(host 为内嵌面板)
// 通过 id 前缀自动识别版本，两处逻辑统一，避免双份冗余。
// 传入的 root 为面板容器，函数内部按 id 前缀取控件。
function bindNickColorPanel(root){
    if(!root) return;
    // 判断版本：内嵌版控件 id 带 "hhkan-uc-"，抽屉版带 "hhkan-pp-"
    const isInline = !!root.querySelector('#hhkan-uc-nick-color1');
    const P = isInline ? 'hhkan-uc' : 'hhkan-pp';
    const preview  = root.querySelector('#' + P + '-nick-color-preview');
    const c1       = root.querySelector('#' + P + '-nick-color1');
    const c2       = root.querySelector('#' + P + '-nick-color2');
    const c2Wrap   = root.querySelector('#' + P + '-nick-color2-wrap');
    const angle    = root.querySelector('#' + P + '-nick-angle');
    const angleWrap= root.querySelector('#' + P + '-nick-angle-wrap');
    const angleVal = root.querySelector('#' + P + '-nick-angle-val');
    const modes    = root.querySelectorAll('.' + P + '-nc-mode');
    const randBtn  = root.querySelector('#' + P + '-nick-color-random');
    const resetBtn = root.querySelector('#' + P + '-nick-color-reset');
    if(!c1) return;   // 面板未含颜色控件，静默跳过

    const cfg = _getNickColor();
    c1.value = cfg.color1 || '#ffffff';
    if(c2) c2.value = cfg.color2 || '#a78bfa';
    if(angle){ angle.value = Number(cfg.angle) || 90; if(angleVal) angleVal.textContent = (Number(cfg.angle) || 90) + '°'; }
    modes.forEach(b=> b.classList.toggle(P + '-nc-mode-active', b.dataset.mode === cfg.mode));
    _toggleColor2();

    // 预览文字跟随当前昵称
    if(preview){
        const cur = (function(){ try{ return localStorage.getItem(HHKAN_PROFILE.KEY_NICK) || HHKAN_PROFILE.defaultNick; }catch(e){ return HHKAN_PROFILE.defaultNick; } })();
        preview.textContent = cur;
    }

    function _toggleColor2(){
        const show = (cfg.mode === 'gradient');
        if(c2Wrap)   c2Wrap.style.display   = show ? '' : 'none';
        if(angleWrap)angleWrap.style.display = show ? '' : 'none';
    }
    function _apply(){
        _setNickColor(cfg);
        if(preview) preview.style.cssText = _nickColorCss(cfg);
        applyProfileToPage();
    }
    modes.forEach(b=>{
        b.addEventListener('click', ()=>{
            cfg.mode = b.dataset.mode;
            modes.forEach(x=> x.classList.toggle(P + '-nc-mode-active', x === b));
            _toggleColor2();
            _apply();
        });
    });
    c1.addEventListener('input', ()=>{ cfg.color1 = c1.value; _apply(); });
    if(c2) c2.addEventListener('input', ()=>{ cfg.color2 = c2.value; _apply(); });
    if(angle) angle.addEventListener('input', ()=>{
        cfg.angle = Number(angle.value) || 0;
        if(angleVal) angleVal.textContent = cfg.angle + '°';
        _apply();
    });
    // 快捷色板
    root.querySelectorAll('.' + P + '-nick-color-swatch').forEach(sw=>{
        sw.addEventListener('click', ()=>{
            const col = sw.dataset.color || '#ffffff';
            cfg.color1 = col;
            c1.value = col;
            if(cfg.mode === 'gradient'){
                cfg.color2 = _contrastColor(col);
                if(c2) c2.value = cfg.color2;
            }
            _apply();
        });
    });
    // 随机渐变
    if(randBtn) randBtn.addEventListener('click', ()=>{
        const pal = ['#ff6b6b','#ff9f43','#ffd93d','#6bcb77','#4d96ff','#5ad6ff','#7f5cff','#ff6fb5'];
        cfg.mode = 'gradient';
        cfg.color1 = pal[Math.floor(Math.random()*pal.length)];
        cfg.color2 = pal[Math.floor(Math.random()*pal.length)];
        cfg.angle  = [0,45,90,135,180,270][Math.floor(Math.random()*6)];
        c1.value = cfg.color1;
        if(c2) c2.value = cfg.color2;
        if(angle){ angle.value = cfg.angle; if(angleVal) angleVal.textContent = cfg.angle + '°'; }
        modes.forEach(x=> x.classList.toggle(P + '-nc-mode-active', x.dataset.mode === 'gradient'));
        _toggleColor2();
        _apply();
    });
    // 恢复默认
    if(resetBtn) resetBtn.addEventListener('click', ()=>{
        Object.assign(cfg, NICK_COLOR_DEFAULT);
        c1.value = cfg.color1;
        if(c2) c2.value = cfg.color2;
        if(angle){ angle.value = cfg.angle; if(angleVal) angleVal.textContent = cfg.angle + '°'; }
        modes.forEach(x=> x.classList.toggle(P + '-nc-mode-active', x.dataset.mode === 'solid'));
        _toggleColor2();
        _apply();
    });
}

// ==================== 使用记录（历史记录）====================
// ★ 记录「我设为头像 / 背景」的每一张图片，含来源分类、使用时间
//   结构：{ id, type:'avatar'|'bg', url, name, catName, t }  按 t 倒序
//   最多保留 MAX 条，超出自动淘汰最旧；用 url 去重，避免同张图重复堆叠。
const PROFILE_HISTORY_MAX = 300;
function _fmtHistoryTime(ts){
    if(!ts) return '未知时间';
    const d = new Date(ts);
    if(isNaN(d.getTime())) return '未知时间';
    const pad = n => String(n).padStart(2,'0');
    const diff = Date.now() - ts;
    if(diff >= 0 && diff < 60*1000)        return '刚刚';
    if(diff >= 0 && diff < 60*60*1000)     return Math.floor(diff/60000) + ' 分钟前';
    if(diff >= 0 && diff < 24*60*60*1000)  return Math.floor(diff/3600000) + ' 小时前';
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function getProfileHistory(){
    try{
        const arr = JSON.parse(localStorage.getItem(HHKAN_PROFILE.KEY_HISTORY) || '[]');
        return Array.isArray(arr) ? arr : [];
    }catch(e){ return []; }
}
function _saveProfileHistory(list){
    try{ localStorage.setItem(HHKAN_PROFILE.KEY_HISTORY, JSON.stringify(list.slice(0, PROFILE_HISTORY_MAX))); }catch(e){}
}
// 写入一条记录（url 相同则更新时间与分类，避免重复）
function addProfileHistory({ type, url, name, catName }){
    if(!url) return;
    const list = getProfileHistory();
    const idx = list.findIndex(h => h.url === url && h.type === type);
    const item = {
        id: idx >= 0 ? list[idx].id : ('ph_' + Date.now() + '_' + Math.random().toString(36).slice(2,6)),
        type: type || 'avatar',
        url: url,
        name: name || (type === 'avatar' ? '头像' : '背景图'),
        catName: catName || '未分类',
        t: Date.now(),
    };
    if(idx >= 0){
        // 同 url 更新到最新
        list.splice(idx, 1);
    }
    list.push(item);
    _saveProfileHistory(list);
}
// 删除单条
function removeProfileHistory(id){
    _saveProfileHistory(getProfileHistory().filter(h => h.id !== id));
}
// 清空全部
function clearProfileHistory(){
    try{ localStorage.removeItem(HHKAN_PROFILE.KEY_HISTORY); }catch(e){}
}
// ==================== 通用二次确认弹窗 ====================
// 返回 Promise<boolean>：点「确定清除」→ true，点「我再想想」/ 遮罩 / Esc → false
// 单例：已存在则先移除，避免快速重复点击堆叠
function hhkanConfirm(opt){
    opt = opt || {};
    const title = opt.title || '确认操作';
    const desc  = opt.desc  || '';
    document.querySelector('#hhkan-confirm-mask')?.remove();
    const mask = document.createElement('div');
    mask.id = 'hhkan-confirm-mask';
    mask.innerHTML = `
        <div class="hhkan-confirm-box" role="dialog" aria-modal="true" aria-labelledby="hhkan-confirm-title">
            <div class="hhkan-confirm-icon">⚠️</div>
            <div class="hhkan-confirm-title" id="hhkan-confirm-title">${title}</div>
            <div class="hhkan-confirm-desc">${desc}</div>
            <div class="hhkan-confirm-btns">
                <button type="button" class="hhkan-confirm-btn hhkan-confirm-ok">确定清除</button>
                <button type="button" class="hhkan-confirm-btn hhkan-confirm-cancel">我再想想</button>
            </div>
        </div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('hhkan-confirm-show'));
    let settled = false;
    return new Promise(resolve => {
        const close = (val) => {
            if (settled) return;
            settled = true;
            mask.classList.remove('hhkan-confirm-show');
            const box = mask.querySelector('.hhkan-confirm-box');
            if (box) box.style.pointerEvents = 'none';
            setTimeout(() => { mask.remove(); }, 220);
            resolve(val);
        };
        mask.querySelector('.hhkan-confirm-ok').onclick = () => close(true);
        mask.querySelector('.hhkan-confirm-cancel').onclick = () => close(false);
        // ★ 遮罩点击 / Esc 一律 = 我再想想，绝不直接清除
        mask.onclick = (e) => { if (e.target === mask) close(false); };
        document.addEventListener('keydown', function onKey(e){
            if (e.key === 'Escape') { e.preventDefault(); close(false); }
            else if (e.key === 'Enter') { e.preventDefault(); close(true); }
        }, { once: true });
    });
}

// ==================== 二次确认弹窗样式 ====================
// 单例注入，仅在首次调用时插入一次；跟随页面主题（自动适配黑夜/白天模式）
(function injectConfirmStyle(){
    if (document.getElementById('hhkan-confirm-style')) return;
    const style = document.createElement('style');
    style.id = 'hhkan-confirm-style';
    style.textContent = `
        #hhkan-confirm-mask{
            position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;
            background:rgba(0,0,0,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
            opacity:0;transition:opacity .22s ease;
        }
        #hhkan-confirm-mask.hhkan-confirm-show{opacity:1;}
        .hhkan-confirm-box{
            width:300px;max-width:86vw;background:#1e1e2e;color:#fff;border-radius:16px;padding:26px 22px 20px;
            box-shadow:0 20px 60px rgba(0,0,0,.5);transform:scale(.85);opacity:0;
            transition:transform .22s cubic-bezier(.22,.7,.35,1),opacity .22s ease;text-align:center;
        }
        #hhkan-confirm-mask.hhkan-confirm-show .hhkan-confirm-box{transform:scale(1);opacity:1;}
        .hhkan-confirm-icon{font-size:38px;margin-bottom:8px;}
        .hhkan-confirm-title{font-size:17px;font-weight:600;margin-bottom:8px;line-height:1.4;}
        .hhkan-confirm-desc{font-size:13px;color:#b0b0c0;line-height:1.6;margin-bottom:20px;}
        .hhkan-confirm-btns{display:flex;gap:10px;}
        .hhkan-confirm-btn{
            flex:1;height:40px;border:none;border-radius:10px;font-size:14px;cursor:pointer;
            transition:filter .15s,transform .15s,opacity .15s;
        }
        .hhkan-confirm-btn:active{transform:scale(.96);}
        .hhkan-confirm-btn:disabled{opacity:.5;cursor:not-allowed;}
        .hhkan-confirm-ok{background:linear-gradient(135deg,#ff6b6b,#ff4757);color:#fff;}
        .hhkan-confirm-cancel{background:#3a3a4d;color:#ddd;}
        .hhkan-confirm-btn:hover{filter:brightness(1.12);}
        body.hhkan-theme-light .hhkan-confirm-box,
        .hhkan-theme-light .hhkan-confirm-box{
            background:#fff;color:#222;box-shadow:0 20px 60px rgba(0,0,0,.18);
        }
        body.hhkan-theme-light .hhkan-confirm-desc,
        .hhkan-theme-light .hhkan-confirm-desc{color:#666;}
        body.hhkan-theme-light .hhkan-confirm-cancel,
        .hhkan-theme-light .hhkan-confirm-cancel{background:#eee;color:#444;}
    `;
    (document.head || document.documentElement).appendChild(style);
})();
// ==================== 通用二次确认弹窗 结束 ====================

// ==================== 随机昵称记录（优化一：仅并入使用记录，不再单独存一份）====================
// ★ 优化一：删除原先独立的昵称历史存储（KEY_NICK_HISTORY / _loadNickHistory / _saveNickHistory），
//   昵称使用记录统一走 addProfileHistory 写入「使用记录」选择夹，避免双份冗余；
//   迁移：若旧版本已在独立存储里存过昵称，首次启动时自动并入统一记录，不丢失历史。
(function _migrateNickHistory(){
    try{
        const KEY_OLD = 'hhkan_nick_history';
        const raw = localStorage.getItem(KEY_OLD);
        if(!raw) return;
        const arr = JSON.parse(raw);
        if(!Array.isArray(arr) || !arr.length){ localStorage.removeItem(KEY_OLD); return; }
        const exist = getProfileHistory();
        const set = new Set(exist.map(h => h.url));
        arr.forEach(it=>{
            const name = (it && it.name) || '';
            if(!name || set.has('nick://' + encodeURIComponent(name))) return;
            addProfileHistory({ type:'nick', url:'nick://' + encodeURIComponent(name), name:'昵称「'+name+'」', catName:it.catName || '随机昵称' });
            set.add('nick://' + encodeURIComponent(name));
        });
        localStorage.removeItem(KEY_OLD);   // 迁移完成后清理旧键
    }catch(e){ /* 迁移失败不影响主流程 */ }
})();
// 写入一条昵称记录到统一使用记录（name 相同则更新时间，保持最新在前）
function _pushNickHistory(name, catName){
    if(!name) return;
    addProfileHistory({ type:'nick', url:'nick://' + encodeURIComponent(name), name:'昵称「'+name+'」', catName:catName || '随机昵称' });
}
// 兼容旧调用：返回空数组（调用方若按旧逻辑遍历本地历史，此处不再提供数据）
function _loadNickHistory(){ return []; }

// ==================== 图片上传（File → dataURL）====================
function _readFileAsDataURL(file){
    return new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onload = ()=> resolve(reader.result);
        reader.onerror = ()=> reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// ==================== 同步渲染头像 / 背景 / 昵称 ====================
let _applyProfileTimer = null;
let _applyProfilePending = false;
function applyProfileToPage(){
    // ★ 节流：避免 MutationObserver 频繁触发导致重复执行
    if(_applyProfilePending) return;
    _applyProfilePending = true;
    clearTimeout(_applyProfileTimer);
    _applyProfileTimer = setTimeout(()=>{
        _applyProfilePending = false;
        _doApplyProfile();
    }, 100);
}
function _doApplyProfile(){
    const { avatar, bg, nick } = _getProfile();
    // ---- 头像：user-avatar ----
    const ua = document.querySelector(PROFILE_SEL.userAvatar);
    if(ua){
        // 清空内部，统一用 img 填充（有头像时）
        if(avatar){
            ua.innerHTML = '';
            let img = ua.querySelector('img');
            if(!img){
                img = document.createElement('img');
                ua.insertBefore(img, ua.firstChild);
            }
            img.src = avatar;
            img.alt = nick;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
            // 移除可能的文字兜底
            Array.from(ua.childNodes).forEach(n=>{ if(n.nodeType===3) n.remove(); });
        }
        ua.dataset.hhkanAvatar = avatar ? '1' : '0';
    }
    // ---- 头像：profile-box 内的头像 img ----
    document.querySelectorAll(PROFILE_SEL.profileAvatars).forEach(el=>{
        if(avatar){
            if(el.tagName === 'IMG'){
                el.src = avatar;
            }else{
                el.style.backgroundImage = `url("${avatar}")`;
            }
        }
    });
    // ---- 昵称 ----
    const nickCss = _nickColorCss();
    const un = document.querySelector(PROFILE_SEL.userNick);
    if(un && nick) un.textContent = nick;
    document.querySelectorAll(PROFILE_SEL.profileNick).forEach(el=>{
        if(!nick) return;
        el.textContent = nick;
        // ★ 优化二：应用昵称字体颜色 / 渐变色
        el.style.cssText = nickCss;
    });
    // userNick 单独应用一次（避免上面 textContent 后样式丢失）
    if(un) un.style.cssText = nickCss;
    // ---- 背景图：应用到 user-box 或其父容器 ----
    const userBox = document.querySelector('body > div.t-p > div.t-p-main > div.main > div.user-box.fs-margin-section');
    if(userBox){
        if(bg){
            userBox.style.backgroundImage = `url("${bg}")`;
            userBox.style.backgroundSize = 'cover';
            userBox.style.backgroundPosition = 'center';
        }else{
            userBox.style.backgroundImage = '';
        }
    }
}

// ==================== 入口按钮 ====================
// ★ 与下拉栏菜单项同款规格（对齐侧边栏菜单的 i 图标 + span 文字结构）：
//   字号 14px、行高 1.2、图标格 18px、圆角 8px、padding 0 12px、flex 水平排列；
//   hover 统一改为 #F5F5DC 米白底 + 近黑字。此处不写内联样式，全交由下方
//   #hhkan-profile-style 中的 .hhkan-profile-entry 规则控制（跟随主题切色）。
function ensureEntryButton(){
    if(!HHKAN_PROFILE.enabled) return;
    const host = document.querySelector(PROFILE_SEL.entryPoint);
    if(!host || host.querySelector('.hhkan-profile-entry')) return;
    const btn = document.createElement('a');
    btn.className = 'hhkan-profile-entry';
    btn.href = 'javascript:;';
    btn.setAttribute('role', 'button');
    // ★ 同款结构：图标 + 文字紧贴，图标用与菜单一致的线条字形（铅笔 ✎）
    btn.innerHTML = '<i class="pp-entry-ic" aria-hidden="true">&#10000;</i><span>装饰修改</span>';
    btn.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        console.log('[诊断][入口按钮] 「装饰修改」被点击');
        // ★ 直接跳转到用户中心「修改资料」内嵌选择夹页面；
        //   若已在用户中心页，则在 user-container-main 内渲染修改资料面板；
        //   若不在用户中心页，则先导航到用户中心（点击左侧「用户中心」菜单项），
        //   待容器渲染完成后再自动切到「修改资料」选择夹 —— 全程不再弹右侧抽屉。
        openEditProfileInlineOrGotoUserCenter();
    });
    host.appendChild(btn);
}

// ==================== 内嵌模式：「修改资料」Tab 嵌入用户中心 ====================
// ★ 在 user-container-header 追加一个「修改资料」选择夹按钮，点击后在
//   user-container-main 内完整渲染修改资料 UI（头像 / 背景 / 昵称 / AI 头像库 /
//   背景图库 / 随机昵称），并隐藏该容器里原有的默认子节点，切走时还原。
//   这样不依赖右侧抽屉，而是直接复用页面自身的布局容器。
let _ucInited = false;
let _ucBackupHTML = '';      // 保存 main 区原有内容，切走时还原
let _ucActive = false;       // 当前是否处于「修改资料」页

function ensureUserCenterTab(){
    if(!HHKAN_PROFILE.enabled) return;
    const header = document.querySelector(PROFILE_SEL.userCenterHeader);
    const main   = document.querySelector(PROFILE_SEL.userCenterMain);
    if(!header || !main) return;
    if(header.querySelector('.hhkan-uc-tab')) return;

    console.log('[诊断][ensureUserCenterTab] 准备挂载 tab | header.querySelector(.hhkan-uc-tab)=',
        !!header.querySelector('.hhkan-uc-tab'), '| header子节点数=', header.children.length);
    const tab = document.createElement('div');
    tab.className = 'hhkan-uc-tab';
    tab.setAttribute('role', 'tab');
    tab.innerHTML = '✏️ 装饰修改';
    tab.addEventListener('click', ()=> {
        console.log('[诊断][tab click] 选择夹被点击，准备 switchToEditProfile');
        switchToEditProfile(main, tab);
    });

    // ★ 问题一修复：定位「观影记录」按钮，把「修改资料」插到它紧右边
    const recordBtn = _findRecordTab(header);
    if(recordBtn && recordBtn.parentNode === header){
        header.insertBefore(tab, recordBtn.nextSibling);
    }else{
        // 兜底：找不到「观影记录」就追加到末尾
        header.appendChild(tab);
    }
    _ucInited = true;
    console.log('[个人中心] ✅ 已在用户中心「观影记录」右边追加「修改资料」选择夹');
}

// 定位「观影记录 / 观看记录 / 我的记录 / 观看历史」选择夹按钮
function _findRecordTab(header){
    if(!header) return null;
    const kw = ['观影记录','观看记录','我的记录','观看历史','播放记录','播放历史','我的观影'];
    const all = header.querySelectorAll('[role="tab"], .tab, [data-tab], a, span, div');
    for(const el of all){
        const txt = (el.textContent || '').trim();
        if(!txt || txt.length > 12) continue;
        for(const k of kw){
            if(txt.indexOf(k) >= 0) return el;
        }
    }
    return null;
}

// 对外：跳转到「修改资料」内嵌页（供头像下拉栏「修改资料」按钮调用）
function openEditProfileInline(){
    const header = document.querySelector(PROFILE_SEL.userCenterHeader);
    const main   = document.querySelector(PROFILE_SEL.userCenterMain);
    console.log('[诊断][openEditProfileInline] header=', !!header, '| main=', !!main,
        '| entryPoint存在=', !!document.querySelector(PROFILE_SEL.entryPoint),
        '| userCenter存在=', !!document.querySelector(PROFILE_SEL.userCenter));
    if(!header || !main) return false;
    // 确保 tab 已挂载
    ensureUserCenterTab();
    const tab = header.querySelector('.hhkan-uc-tab');
    if(tab){
        switchToEditProfile(main, tab);
        return true;
    }
    return false;
}

// ★ 点击「修改资料」的统一跳转逻辑：
//   1) 若当前已在用户中心页 → 直接在 user-container-main 内渲染修改资料面板；
//   2) 若不在用户中心页 → 按优先级依次尝试：
//      a) 点击侧边栏「用户中心」菜单项（精确匹配文字 / data-tab / 路由属性）
//      b) 直接修改 location.hash 触发 SPA 路由（hash 模式）
//      c) 触发 hashchange / popstate 事件强制刷新路由
//      d) 兜底用 history.pushState 切换 URL 并手动派发 popstate
//   3) 每次尝试后用轮询检测 user-container-main 是否渲染完成，
//      就绪即自动切到「修改资料」选择夹；全程不再弹右侧抽屉。
let _gotoUserCenterRunning = false;  // ★ 防止重复触发跳转流程
function openEditProfileInlineOrGotoUserCenter(){
    if(_gotoUserCenterRunning){
        console.log('[诊断][总入口] 跳转流程已在执行中，忽略重复触发');
        return;
    }
    _gotoUserCenterRunning = true;

    console.log('[诊断][总入口] 被触发 | location.hash=', location.hash,
        '| pathname=', location.pathname);
    // 情况一：已在用户中心页，直接切到「修改资料」
    if(openEditProfileInline()){
        console.log('[诊断][总入口] 已在用户中心，直接切成功');
        _gotoUserCenterRunning = false;
        return;
    }
    console.log('[诊断][总入口] 不在用户中心，准备尝试跳转策略');

    // 收集所有可能的跳转策略，按优先级排列
    const strategies = [];

    // 策略 a：点击侧边栏「用户中心」菜单项
    const userCenterLink = _findUserCenterLink();
    if(userCenterLink){
        console.log('[诊断][策略a] 找到侧边栏链接：', (userCenterLink.textContent||'').trim(), '| href=', userCenterLink.getAttribute('href'));
        strategies.push(()=>{ try{ console.log('[诊断][策略a] 执行 click'); userCenterLink.click(); return true; }catch(e){ return false; } });
    }
    // 策略 b：通过 href="#/xxx" 的链接跳转
    const hashLink = _findUserCenterHashLink();
    if(hashLink){
        console.log('[诊断][策略b] 找到 hash 链接：', (hashLink.textContent||'').trim(), '| href=', hashLink.getAttribute('href'));
        strategies.push(()=>{ try{ console.log('[诊断][策略b] 执行 click'); hashLink.click(); return true; }catch(e){ return false; } });
    }
    // 策略 c：直接改 location.hash
    strategies.push(()=>{
        const route = _guessUserCenterHash();
        console.log('[诊断][策略c] 猜测路由=', route);
        if(route){ try{ location.hash = route; return true; }catch(e){ return false; } }
        return false;
    });
    // 策略 d：history.pushState + popstate
    strategies.push(()=>{
        const route = _guessUserCenterHash();
        console.log('[诊断][策略d] 猜测路由=', route);
        if(route){
            try{
                const url = location.pathname + location.search + route;
                history.pushState(null, '', url);
                window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
                return true;
            }catch(e){ console.warn('[诊断][策略d] pushState 异常', e); return false; }
        }
        return false;
    });

    // 依次执行策略，每个策略后都轮询检测容器是否就绪
    let si = 0;
    function tryNextStrategy(){
        if(si >= strategies.length){
            // 所有策略都失败，提示用户
            console.log('[诊断][总入口] \u274c 所有跳转策略均失败');
            window.showFloatTip && window.showFloatTip('跳转用户中心失败，请手动点击左侧「用户中心」');
            _gotoUserCenterRunning = false;  // ★ 释放锁
            return;
        }
        strategies[si]();
        si++;

        // 轮询检测（当前策略最多等 4.5s = 30 × 150ms）
        let tries = 0;
        const maxTries = 30;
        const checkTimer = setInterval(()=>{
            tries++;
            ensureUserCenterTab();
            if(openEditProfileInline()){
                console.log('[诊断][策略'+si+'] 第'+tries+'次轮询：容器就绪，切成功');
                clearInterval(checkTimer);
                _gotoUserCenterRunning = false;  // ★ 释放锁
                return;
            }
            if(tries >= maxTries){
                clearInterval(checkTimer);
                // 当前策略超时，尝试下一个
                tryNextStrategy();
            }
        }, 150);
    }

    tryNextStrategy();
}

// 定位所有带 hash 路由的「用户中心」链接（比 _findUserCenterLink 更宽泛）
function _findUserCenterHashLink(){
    const kw = ['user','uc','center','profile','member','account','我的','个人','用户','会员'];
    const hashLinks = document.querySelectorAll('a[href^="#/"], a[href^="#"]');
    for(const a of hashLinks){
        const href = (a.getAttribute('href') || '').toLowerCase();
        const txt = (a.textContent || '').trim();
        if(!href || href === '#') continue;
        // 文字或 href 含关键词即匹配
        let match = false;
        for(const k of kw){
            if(href.indexOf(k) >= 0 || txt.indexOf(k) >= 0){ match = true; break; }
        }
        if(match) return a;
    }
    return null;
}

// 推断用户中心的 hash 路由：先看现有链接，再看 SPA 常见约定
function _guessUserCenterHash(){
    const seen = new Set();
    const hashLinks = document.querySelectorAll('a[href^="#/"]');
    const kw = ['user','uc','center','profile','member','我的','个人','用户'];
    for(const a of hashLinks){
        const href = (a.getAttribute('href') || '').toLowerCase();
        const txt = (a.textContent || '').trim();
        for(const k of kw){
            if(href.indexOf(k) >= 0 || txt.indexOf(k) >= 0){
                // 去掉 query 部分，只保留纯 hash 路由
                const pure = href.split('?')[0].split('&')[0];
                if(pure && pure !== '#') return pure;
            }
        }
    }
    // 兜底：SPA 常见用户中心路由
    return '#/user';
}

// 定位侧边栏里的「用户中心 / 个人中心 / 我的」菜单项
// ★ 精确匹配：优先找文字完全等于关键词的 a 标签（侧边栏菜单项结构）
function _findUserCenterLink(){
    const kw = ['用户中心','个人中心','我的','会员中心','个人主页','用户主页'];
    // 优先级 1：侧边栏 ul > li > a 结构中的精确匹配
    const sideLinks = document.querySelectorAll('.t-p-side a, .t-p-side li > a, div.t-p-side a');
    for(const el of sideLinks){
        const txt = (el.textContent || '').trim();
        if(!txt) continue;
        for(const k of kw){
            if(txt === k || txt.indexOf(k) >= 0){
                return el;
            }
        }
    }
    // 优先级 2：全局 a 标签中文字较短的匹配
    const allLinks = document.querySelectorAll('a');
    for(const el of allLinks){
        const txt = (el.textContent || '').trim();
        if(!txt || txt.length > 12) continue;
        for(const k of kw){
            if(txt.indexOf(k) >= 0) return el;
        }
    }
    // 优先级 3：兜底——任意含关键词的元素
    const candidates = document.querySelectorAll(
        'span, li, div[role="button"], [data-tab], [role="tab"]'
    );
    for(const el of candidates){
        const txt = (el.textContent || '').trim();
        if(!txt || txt.length > 12) continue;
        for(const k of kw){
            if(txt.indexOf(k) >= 0) return el;
        }
    }
    return null;
}

// ★ 兜底：通过 hash 路由强制跳转到用户中心页
//   SPA 站点通常把路由挂在 location.hash 上（如 #/user、#/uc、#/center），
//   菜单点击无效时，尝试常见 hash 路径触发路由切换。
function _forceGotoUserCenter(){
    const route = _guessUserCenterHash();
    if(route && location.hash !== route){
        try{ location.hash = route; }catch(e){}
    }
}

// 轮询等待 user-container-main 渲染就绪（SPA 路由跳转后容器异步出现）
function _waitForUserCenter(cb, maxTry, interval){
    maxTry = maxTry || 40;      // 最多等 40 次
    interval = interval || 150; // 每次间隔 150ms，总计约 6s
    let n = 0;
    const timer = setInterval(()=>{
        n++;
        if(document.querySelector(PROFILE_SEL.userCenterMain)){
            clearInterval(timer);
            cb();
        }else if(n >= maxTry){
            clearInterval(timer);
            cb();
        }
    }, interval);
}

// 切到「修改资料」：备份原内容，渲染内嵌 UI
let _ucSwitching = false;  // ★ 防止重复切换导致卡死
function switchToEditProfile(main, tab){
    if(_ucSwitching) return;  // ★ 已在切换中，直接返回
    _ucSwitching = true;

    // 还原其它可能处于激活态的选择夹（由页面自己控制，这里只取消自己的高亮）
    document.querySelectorAll('.hhkan-uc-tab').forEach(t=> t.classList.remove('hhkan-uc-tab-active'));
    tab.classList.add('hhkan-uc-tab-active');

    // 首次进入时备份原内容（等待一帧确保 SPA 已渲染完成）
    if(!_ucBackupHTML){
        _ucBackupHTML = main.innerHTML;
    }
    // 若已经渲染过内嵌面板，直接显示即可
    const exist = main.querySelector('.hhkan-uc-edit');
    if(exist){
        main.innerHTML = '';
        main.appendChild(exist);
        _ucSwitching = false;
    }else{
        main.innerHTML = '';
        // ★ 用 requestAnimationFrame 分帧渲染，避免一次性大量 DOM 操作阻塞主线程
        requestAnimationFrame(()=>{
            main.appendChild(buildInlineEditPanel());
            _ucSwitching = false;
        });
        // 兜底解锁，确保渲染完成后一定释放锁
        setTimeout(()=>{ _ucSwitching = false; }, 500);
        return;
    }
    _ucActive = true;
    console.log('[诊断][switchToEditProfile] 已切换 | main子节点数=', main.children.length,
        '| .hhkan-uc-edit-inner 存在=', !!main.querySelector('.hhkan-uc-edit-inner'),
        '| 备份长度=', _ucBackupHTML ? _ucBackupHTML.length : 0);
}

// 监听选择夹：当 header 里「非修改资料」的选择夹被点击时，自动还原 main 区
let _ucResetBound = false;  // ★ 防止多次绑定重复事件
function watchUserCenterReset(){
    const header = document.querySelector(PROFILE_SEL.userCenterHeader);
    if(!header || _ucResetBound) return;
    _ucResetBound = true;
    header.addEventListener('click', (e)=>{
        const t = e.target.closest('[role="tab"], .tab, [data-tab], a, span, div');
        if(!t) return;
        // 点的是我们自己的 tab 不处理
        if(t.classList && t.classList.contains('hhkan-uc-tab')) return;
        // 还原
        if(_ucActive){
            const main = document.querySelector(PROFILE_SEL.userCenterMain);
            if(main && _ucBackupHTML){
                main.innerHTML = _ucBackupHTML;
            }
            document.querySelectorAll('.hhkan-uc-tab').forEach(x=> x.classList.remove('hhkan-uc-tab-active'));
            _ucActive = false;
        }
    }, true);
}

// 构建内嵌版「修改资料」面板（结构同抽屉面板，但适配页面容器宽度）
function buildInlineEditPanel(){
    const { avatar, bg, nick } = _getProfile();
    const host = document.createElement('div');
    host.className = 'hhkan-uc-edit';
    host.innerHTML = `
      <div class="hhkan-uc-edit-inner">
        <div class="hhkan-uc-head">
          <h3>✏️ 装饰修改</h3>
          <span class="hhkan-uc-sub">修改头像 / 背景图 / 昵称，支持 AI 头像库 · 随机壁纸（12 分类各 50 张 · 不叠加不重复）· 随机昵称 · 字体颜色</span>
        </div>
        <!-- 预览区 -->
        <div class="hhkan-pp-preview">
          <div class="hhkan-pp-avatar-wrap">
            <div class="hhkan-pp-avatar" id="hhkan-uc-avatar-preview">${avatar ? `<img src="${avatar}">` : '<span class="hhkan-pp-avatar-emoji">🐻</span>'}</div>
            <label class="hhkan-pp-upload-btn">
              📷 上传头像
              <input type="file" id="hhkan-uc-avatar-file" accept="image/*" hidden>
            </label>
          </div>
          <div class="hhkan-pp-bg-wrap">
            <div class="hhkan-pp-bg" id="hhkan-uc-bg-preview" style="${bg ? `background-image:url('${bg}')` : ''}">
              ${bg ? '' : '<span class="hhkan-pp-bg-tip">🖼️ 暂无背景图</span>'}
            </div>
            <label class="hhkan-pp-upload-btn hhkan-pp-upload-btn-sec">
              🖼️ 上传背景图
              <input type="file" id="hhkan-uc-bg-file" accept="image/*" hidden>
            </label>
          </div>
        </div>
        <!-- 昵称 -->
        <div class="hhkan-pp-nick-row">
          <label>昵称</label>
          <input type="text" id="hhkan-uc-nick" value="${nick}" maxlength="20" placeholder="请输入昵称">
          <button id="hhkan-uc-nick-save">保存昵称</button>
        </div>
        <!-- 分区 Tabs -->
        <div class="hhkan-pp-tabs">
          <button class="hhkan-pp-tab hhkan-pp-tab-active" data-tab="avatar">🤖 AI 头像库</button>
          <button class="hhkan-pp-tab" data-tab="bg">🖼️ 背景图库</button>
          <button class="hhkan-pp-tab" data-tab="nick">✨ 随机昵称</button>
          <button class="hhkan-pp-tab" data-tab="history">🕘 使用记录</button>
        </div>
        <!-- 头像库 -->
        <div class="hhkan-pp-tab-pane" data-pane="avatar">
          <div class="hhkan-pp-ai-head">
            <span>🤖 AI 绘画头像库 · 支持 ${HHKAN_PROFILE.avatarStyles.length} 种风格 · 无限生成</span>
            <span class="hhkan-pp-tip-mini">点击任意头像即可设为我的头像</span>
            <div class="hhkan-pp-cats" id="hhkan-uc-cats"></div>
          </div>
          <div class="hhkan-pp-ai-grid" id="hhkan-uc-ai-grid"></div>
          <div class="hhkan-pp-ai-more">
            <button id="hhkan-uc-ai-more">换一批</button>
            <span id="hhkan-uc-ai-count"></span>
          </div>
        </div>
        <!-- 背景图库 · 随机壁纸（内嵌 · 12 分类各 50 张 · 不叠加不重复）-->
        <!-- 背景图库 · 随机壁纸（内嵌 · 12 分类各 50 张 · 不叠加不重复） -->
        <div class="hhkan-pp-tab-pane" data-pane="bg" hidden>
          <div class="hhkan-pp-ai-head">
            <span>🖼️ 背景图库 · 随机壁纸</span>
            <span class="hhkan-pp-tip-mini">选分类出 50 张，点图即设为背景；每次「换一批」不重复，抽完才重置，分类之间互不叠加</span>
            <div class="hhkan-pp-cats" id="hhkan-uc-bg-cats"></div>
          </div>
          <div class="hhkan-pp-ai-grid hhkan-pp-bg-grid" id="hhkan-uc-bg-grid"></div>
          <div class="hhkan-pp-ai-more">
            <button id="hhkan-uc-bg-more">🔄 换一批</button>
            <span id="hhkan-uc-bg-count"></span>
          </div>
          <div class="hhkan-pp-bg-note" id="hhkan-uc-bg-note"></div>
        </div>
        <!-- 随机昵称（优化二：风格 / 调性 / 元素 三维筛选 + 字体颜色 / 渐变色） -->
        <div class="hhkan-pp-tab-pane" data-pane="nick" hidden>
          <div class="hhkan-pp-ai-head">
            <span>✨ 随机昵称 · 风格 / 调性 / 元素 三维筛选</span>
            <span class="hhkan-pp-tip-mini">先选风格定气质，再调调性 / 元素微调，一次出 100 个候选，点哪个用哪个</span>
            <div class="hhkan-pp-cats" id="hhkan-uc-nick-cats"></div>
            <div class="hhkan-pp-subcats">
              <div class="hhkan-pp-subcat">
                <span class="hhkan-pp-subcat-label">调性</span>
                <div class="hhkan-pp-cats hhkan-pp-cats-mini" id="hhkan-uc-nick-moods"></div>
              </div>
              <div class="hhkan-pp-subcats-line"></div>
              <div class="hhkan-pp-subcat">
                <span class="hhkan-pp-subcat-label">元素</span>
                <div class="hhkan-pp-cats hhkan-pp-cats-mini" id="hhkan-uc-nick-elems"></div>
              </div>
            </div>
          </div>
          <!-- ★ 优化二：昵称字体颜色 / 渐变色设置 -->
          <div class="hhkan-pp-nick-color">
            <div class="hhkan-pp-nick-color-head">
              <span class="hhkan-pp-nick-color-title">🎨 昵称字体颜色</span>
              <span class="hhkan-pp-nick-color-preview" id="hhkan-uc-nick-color-preview">好好看用户</span>
            </div>
            <div class="hhkan-pp-nick-color-modes">
              <button class="hhkan-pp-nc-mode hhkan-pp-nc-mode-active" data-mode="solid">纯色</button>
              <button class="hhkan-pp-nc-mode" data-mode="gradient">渐变色</button>
            </div>
            <div class="hhkan-pp-nick-color-body">
              <label class="hhkan-pp-nc-field">
                <span>颜色一</span>
                <input type="color" id="hhkan-uc-nick-color1" value="#ffffff">
              </label>
              <label class="hhkan-pp-nc-field" id="hhkan-uc-nick-color2-wrap">
                <span>颜色二</span>
                <input type="color" id="hhkan-uc-nick-color2" value="#a78bfa">
              </label>
              <label class="hhkan-pp-nc-field" id="hhkan-uc-nick-angle-wrap">
                <span>渐变角度 <b id="hhkan-uc-nick-angle-val">90°</b></span>
                <input type="range" id="hhkan-uc-nick-angle" min="0" max="360" value="90">
              </label>
            </div>
            <div class="hhkan-pp-nick-color-actions">
              <button class="hhkan-pp-nick-color-swatch" data-color="#ffffff" title="纯白"></button>
              <button class="hhkan-pp-nick-color-swatch" data-color="#f5c518" title="金黄"></button>
              <button class="hhkan-pp-nick-color-swatch" data-color="#7f5cff" title="紫"></button>
              <button class="hhkan-pp-nick-color-swatch" data-color="#5ad6ff" title="天蓝"></button>
              <button class="hhkan-pp-nick-color-swatch" data-color="#6bcb77" title="绿"></button>
              <button class="hhkan-pp-nick-color-swatch" data-color="#ff6fb5" title="粉"></button>
              <button class="hhkan-pp-nick-color-swatch" data-color="#ff9f43" title="橙"></button>
              <button class="hhkan-pp-nick-color-swatch" data-color="#ff6b6b" title="红"></button>
              <button class="hhkan-pp-nick-color-random" id="hhkan-uc-nick-color-random" title="随机渐变">🎲 随机渐变</button>
              <button class="hhkan-pp-nick-color-reset" id="hhkan-uc-nick-color-reset">恢复默认</button>
            </div>
          </div>
          <div class="hhkan-pp-nick-result">
            <div class="hhkan-pp-nick-big" id="hhkan-uc-nick-big">点击下方「🎲 生成 100 个」开始</div>
            <div class="hhkan-pp-nick-sub" id="hhkan-uc-nick-sub">支持 7 种风格 · 点中任意昵称即可选中</div>
          </div>
          <div class="hhkan-pp-nick-grid" id="hhkan-uc-nick-grid"></div>
          <div class="hhkan-pp-nick-actions">
            <button class="hhkan-pp-nick-rand" id="hhkan-uc-nick-rand">🎲 生成 100 个</button>
            <button class="hhkan-pp-nick-use"  id="hhkan-uc-nick-use">✅ 用它当昵称</button>
          </div>
          <div class="hhkan-pp-nick-history-note">📌 昵称保存后会出现在右侧「🕘 使用记录」选择夹的「✨ 昵称」筛选里，无需额外记录夹</div>
        </div>
        <!-- 使用记录（历史记录）：记录「我设为头像 / 背景」的图片 -->
        <div class="hhkan-pp-tab-pane" data-pane="history" hidden>
          <div class="hhkan-pp-ai-head">
            <span>🕘 使用记录 · 记录你设为头像 / 背景的图片，以及使用过的昵称</span>
            <span class="hhkan-pp-tip-mini">点击卡片可重新应用；昵称记录点 ✕ 可删除</span>
            <div class="hhkan-pp-history-toolbar">
              <div class="hhkan-pp-history-filter" id="hhkan-uc-history-filter">
                <button class="hhkan-pp-hfilter hhkan-pp-hfilter-active" data-filter="all">全部</button>
                <button class="hhkan-pp-hfilter" data-filter="avatar">🤖 头像</button>
                <button class="hhkan-pp-hfilter" data-filter="bg">🖼️ 背景</button>
                <button class="hhkan-pp-hfilter" data-filter="nick">✨ 昵称</button>
              </div>
              <button class="hhkan-pp-history-clear" id="hhkan-uc-history-clear">🗑️ 清空记录</button>
            </div>
          </div>
          <div class="hhkan-pp-history-stats" id="hhkan-uc-history-stats"></div>
          <div class="hhkan-pp-history-empty" id="hhkan-uc-history-empty" hidden>
            <div class="hhkan-pp-history-empty-icon">🕘</div>
            <div class="hhkan-pp-history-empty-text">还没有使用记录</div>
            <div class="hhkan-pp-history-empty-sub">在「AI 头像库 / 背景图库」里点击图片设为头像或背景，就会记录在这里</div>
          </div>
          <div class="hhkan-pp-ai-grid" id="hhkan-uc-history-grid"></div>
        </div>
      </div>
      <!-- ★ 精美结果弹窗：上传头像 / 上传背景图 / 保存昵称 完成后弹出 -->
      <div class="hhkan-pp-toast-mask" id="hhkan-uc-toast" hidden>
        <div class="hhkan-pp-toast">
          <div class="hhkan-pp-toast-ring"></div>
          <div class="hhkan-pp-toast-ring2"></div>
          <div class="hhkan-pp-toast-burst"></div>
          <div class="hhkan-pp-toast-icon" id="hhkan-uc-toast-icon">✅</div>
          <div class="hhkan-pp-toast-confetti"></div>
          <div class="hhkan-pp-toast-title" id="hhkan-uc-toast-title">保存成功</div>
          <div class="hhkan-pp-toast-desc" id="hhkan-uc-toast-desc">资料已更新</div>
          <div class="hhkan-pp-toast-preview" id="hhkan-uc-toast-preview"></div>
          <button class="hhkan-pp-toast-btn" id="hhkan-uc-toast-btn">我知道了</button>
        </div>
      </div>
    `;
    bindInlineEditEvents(host);
    return host;
}

// 内嵌面板的事件绑定（复用的逻辑与抽屉版一致，只选择器换成内嵌版 id）
function bindInlineEditEvents(host){
    // ★ 内嵌版弹窗：内嵌面板有自己独立的 #hhkan-uc-toast，
    //   用内嵌面板自身作为 scope 查找弹窗，避免找不到弹窗而静默失败。
    // ★ 精美的成功结果弹窗：缩放淡入 + 图标弹跳 + 光环扩散 + 碎片粒子，
    //   支持自定义图标 / 标题 / 描述 / 预览图 / 粒子颜色，带遮罩点击与键盘关闭。
    function showUcToast(opt){
        opt = opt || {};
        const toast = host.querySelector('#hhkan-uc-toast');
        if(!toast){
            // 兜底：若内嵌弹窗尚未渲染，回退到抽屉版弹窗函数
            if(typeof showProfileToast === 'function'){
                return showProfileToast(document.body, opt);
            }
            return;
        }
        const icon    = toast.querySelector('#hhkan-uc-toast-icon');
        const title   = toast.querySelector('#hhkan-uc-toast-title');
        const desc    = toast.querySelector('#hhkan-uc-toast-desc');
        const preview = toast.querySelector('#hhkan-uc-toast-preview');
        const btn     = toast.querySelector('#hhkan-uc-toast-btn');
        icon.textContent  = opt.icon || '✅';
        title.textContent = opt.title || '操作成功';
        desc.textContent  = opt.desc || '';
        // 根据类型切主题色（成功 / 警告 / 失败）
        let tone = 'ok';
        if(/失败|不能为空|太长|不对/.test(opt.title || '')) tone = 'bad';
        else if(/警告|太大|重试/.test(opt.title || '')) tone = 'warn';
        toast.dataset.tone = tone;
        // 预览图：有图则显示，无图则隐藏
        if(opt.previewUrl){
            preview.style.backgroundImage = `url("${opt.previewUrl}")`;
            preview.hidden = false;
        }else{
            preview.hidden = true;
            preview.style.backgroundImage = '';
        }

        // 显示 + 动画：先重置再触发，保证重复点击也能重播
        toast.hidden = false;
        toast.classList.remove('hhkan-pp-toast-hide');
        const box = toast.querySelector('.hhkan-pp-toast');
        if(box){
            box.style.animation = 'none';
            void box.offsetWidth;
            box.style.animation = '';
        }
        // 强制重绘以重启动画
        icon.style.animation = 'none';
        void icon.offsetWidth;
        icon.style.animation = '';
        const ring = box.querySelector('.hhkan-pp-toast-ring');
        if(ring){ ring.style.animation = 'none'; void ring.offsetWidth; ring.style.animation = ''; }
        const ring2 = box.querySelector('.hhkan-pp-toast-ring2');
        if(ring2){ ring2.style.animation = 'none'; void ring2.offsetWidth; ring2.style.animation = ''; }
        const burst = box.querySelector('.hhkan-pp-toast-burst');
        if(burst){ burst.style.animation = 'none'; void burst.offsetWidth; burst.style.animation = ''; }
        // 成功类才撒彩色粒子，警告/失败类只做简单淡入
        const confetti = box.querySelector('.hhkan-pp-toast-confetti');
        if(confetti){
            confetti.innerHTML = '';
            if(tone === 'ok'){
                const colors = (opt.colors && opt.colors.length) ? opt.colors
                    : ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6fb5','#7f5cff','#5ad6ff','#ff9f43'];
                const N = 24;
                for(let i=0;i<N;i++){
                    const s = document.createElement('span');
                    const angle = (360 / N) * i + (Math.random()*18 - 9);
                    const dist  = 62 + Math.random()*30;
                    const color = colors[i % colors.length];
                    const size  = 5 + Math.random()*5;
                    const dur   = (620 + Math.random()*320).toFixed(0) + 'ms';
                    const delay = (i * 12).toFixed(0) + 'ms';
                    s.style.cssText = `
                        left:50%;top:44%;width:${size}px;height:${size*1.35}px;
                        background:${color};
                        --tx:${Math.cos(angle*Math.PI/180)*dist}px;
                        --ty:${Math.sin(angle*Math.PI/180)*dist}px;
                        animation:hhkanPpConfetti ${dur} ${delay} cubic-bezier(.22,.7,.35,1) forwards;
                    `;
                    confetti.appendChild(s);
                }
            }
        }

        clearTimeout(_toastTimer);
        // 关闭函数：关闭弹窗
        const close = ()=>{
            clearTimeout(_toastTimer);
            toast.classList.add('hhkan-pp-toast-hide');
            setTimeout(()=>{ toast.hidden = true; }, 260);
        };
        // 自动关闭（成功类 2.6s，警告类 3.6s，失败类不自动关）
        if(tone !== 'bad'){
            _toastTimer = setTimeout(close, tone === 'warn' ? 3600 : 2600);
        }
        // 按钮点击 / 回车 / Esc 均可关闭
        const onKey = (e)=>{
            if(e.key === 'Enter' || e.key === 'Escape'){
                e.preventDefault();
                close();
            }
        };
        // ★ 每次重新绑定时先解绑旧的监听，避免重复
        btn?.removeEventListener('click', close);
        btn?.addEventListener('click', ()=>{
            // 支持 onConfirm 回调（用于"确认清空"等二次确认场景）
            if(typeof opt.onConfirm === 'function'){
                try{ opt.onConfirm(); }catch(e){ console.warn('[弹窗] onConfirm 执行失败：', e); }
            }
            close();
        });
        // mask 点击关闭
        toast.onclick = (e)=>{ if(e.target === toast) close(); };
        document.removeEventListener('keydown', onKey);
        document.addEventListener('keydown', onKey, { once:true });
    }
    // Tab 切换
    host.querySelectorAll('.hhkan-pp-tab').forEach(tab=>{
        tab.addEventListener('click', ()=>{
            const target = tab.dataset.tab;
            host.querySelectorAll('.hhkan-pp-tab').forEach(t=> t.classList.toggle('hhkan-pp-tab-active', t===tab));
            host.querySelectorAll('.hhkan-pp-tab-pane').forEach(p=>{
                p.hidden = (p.dataset.pane !== target);
            });
        });
    });
    // 上传头像
    host.querySelector('#hhkan-uc-avatar-file').addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        if(!/^image\//.test(file.type)){
            return showUcToast( { icon:'⚠️', title:'格式不对', desc:'请选择图片文件（JPG / PNG / GIF 等）' });
        }
        if(file.size > 3*1024*1024){
            return showUcToast( { icon:'⚠️', title:'图片太大', desc:'请选择 3MB 以内的图片，否则可能保存失败' });
        }
        const data = await _readFileAsDataURL(file);
        _setAvatar(data);
        applyProfileToPage();
        const prev = host.querySelector('#hhkan-uc-avatar-preview');
        prev.innerHTML = `<img src="${data}">`;
        showUcToast({
            icon:'🎉', title:'头像上传成功',
            desc:'你的专属头像已焕新，个人主页与头部同步更新',
            previewUrl:data,
            colors:['#7f5cff','#5ad6ff','#4d96ff','#6bcb77','#ffd93d','#ff6fb5']
        });
    });
    // 上传背景
    host.querySelector('#hhkan-uc-bg-file').addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        if(!/^image\//.test(file.type)){
            return showUcToast( { icon:'⚠️', title:'格式不对', desc:'请选择图片文件（JPG / PNG / GIF 等）' });
        }
        if(file.size > 3*1024*1024){
            return showUcToast( { icon:'⚠️', title:'图片太大', desc:'请选择 3MB 以内的图片' });
        }
        const data = await _readFileAsDataURL(file);
        _setBg(data);
        applyProfileToPage();
        const prev = host.querySelector('#hhkan-uc-bg-preview');
        prev.style.backgroundImage = `url('${data}')`;
        prev.querySelector('.hhkan-pp-bg-tip')?.remove();
        showUcToast({
            icon:'🌈', title:'背景图上传成功',
            desc:'个人主页背景已实时刷新，看看效果吧',
            previewUrl:data,
            colors:['#ff9f43','#ff6b6b','#ff6fb5','#7f5cff','#5ad6ff','#6bcb77']
        });
    });
    // 保存昵称
    host.querySelector('#hhkan-uc-nick-save').addEventListener('click', ()=>{
        const val = host.querySelector('#hhkan-uc-nick').value.trim() || HHKAN_PROFILE.defaultNick;
        _setNick(val);
        applyProfileToPage();
        // ★ 优化二：同步刷新颜色预览文字
        const pv = host.querySelector('#hhkan-uc-nick-color-preview');
        if(pv) pv.textContent = val;
        showUcToast({
            icon:'✨', title:'昵称保存成功',
            desc:`「${val}」已同步到个人主页与头部`,
            colors:['#ffd93d','#ff9f43','#ff6b6b','#7f5cff','#5ad6ff','#6bcb77']
        });
    });

    // ===== 头像库（内嵌版）=====
    // ★ 每个分类固定出 50 张（perPage=50），刷新按钮换一批并弹「成功 + 撒花」提示
    const aiState = { cat: null, batch: 0 };
    function renderAi(){
        const grid = host.querySelector('#hhkan-uc-ai-grid');
        const countEl = host.querySelector('#hhkan-uc-ai-count');
        const cats = aiState.cat ? [aiState.cat] : HHKAN_PROFILE.avatarStyles;
        const usedCat = aiState.cat || { name:'全部', icon:'🔥' };
        // 每个分类均分 50 张，保证每个分类固定 50 张
        const perCat = Math.max(1, Math.ceil(HHKAN_PROFILE.perPage / cats.length));
        let rendered = 0;
        grid.innerHTML = '';
        cats.forEach(cat=>{
            for(let i=0;i<perCat;i++){
                if(rendered >= HHKAN_PROFILE.perPage) break;
                // 用 batch 作偏移，保证不同批次出不同图
                const url = _aiUrl(cat, aiState.batch * perCat + i);
                const item = document.createElement('div');
                item.className = 'hhkan-pp-ai-item';
                item.style.backgroundImage = `url("${url}")`;
                item.title = `${cat.name} · AI 头像`;
                item.addEventListener('click', ()=>{
                    _setAvatar(url);
                    applyProfileToPage();
                    const prev = host.querySelector('#hhkan-uc-avatar-preview');
                    prev.innerHTML = `<img src="${url}">`;
                    grid.querySelectorAll('.hhkan-pp-ai-item').forEach(x=> x.classList.remove('hhkan-pp-ai-active'));
                    item.classList.add('hhkan-pp-ai-active');
                    // ★ 记录到使用记录（历史记录）
                    addProfileHistory({ type:'avatar', url:url, name:`「${usedCat.name}」风格头像`, catName:usedCat.name });
                    // ★ 优化一：实时刷新使用记录列表，无需重新打开面板
                    renderProfileHistory();
                    showUcToast( { icon:'🎨', title:'AI 头像已应用', desc:`「${usedCat.name}」风格头像已同步到个人主页与头部`, previewUrl:url });
                });
                grid.appendChild(item);
                rendered++;
            }
        });
        if(countEl) countEl.textContent = `已展示 ${rendered.toLocaleString()} 张 · 第 ${aiState.batch + 1} 批（${usedCat.name}）`;
    }
    function renderAiCats(){
        const box = host.querySelector('#hhkan-uc-cats');
        renderCatButtons(box, HHKAN_PROFILE.avatarStyles, aiState.cat, (cat)=>{
            aiState.cat = cat; aiState.batch = 0; renderAi();
        });
    }
    // ★ 刷新（换一批）：带「成功 + 撒花」精美弹窗提示
    host.querySelector('#hhkan-uc-ai-more').addEventListener('click', ()=>{
        aiState.batch++;
        renderAi();
        showUcToast({
            icon:'🎉', title:'头像已刷新',
            desc:`「${aiState.cat ? aiState.cat.name : '全部'}」分类已换上第 ${aiState.batch + 1} 批 ${HHKAN_PROFILE.perPage} 张新头像`,
            colors:['#7f5cff','#5ad6ff','#6bcb77','#ffd93d','#ff6fb5','#4d96ff']
        });
    });
    renderAiCats();
    renderAi();

    // ===== 背景图库（内嵌版 · 随机壁纸 · 12 分类各 50 张 · 不叠加不重复）=====
    // 分类按钮切换后，从该类独占的 seed 区间按「洗牌队列」取 perPage 张，
    // 每张 seed 在本生命周期内只出现一次；网络不通时降级为本地 SVG 渐变兜底。
    const bgState = { cat: null };
    function renderBgCats(){
        const box = host.querySelector('#hhkan-uc-bg-cats');
        // 首项是「全部」聚合：把所有分类的 50 张合并成一个大池，再按批洗牌
        const allCat = { name:'全部', icon:'🔥', seg:[
            HHKAN_PROFILE.bgCategories[0].seg[0],
            HHKAN_PROFILE.bgCategories[HHKAN_PROFILE.bgCategories.length-1].seg[1]
        ]};
        const list = [allCat, ...HHKAN_PROFILE.bgCategories];
        renderCatButtons(box, list, bgState.cat, (cat)=>{
            bgState.cat = cat; renderBgWall();
        });
    }
    function renderBgWall(){
        const grid = host.querySelector('#hhkan-uc-bg-grid');
        const countEl = host.querySelector('#hhkan-uc-bg-count');
        const noteEl = host.querySelector('#hhkan-uc-bg-note');
        const cat = bgState.cat || { name:'全部', icon:'🔥', seg:[
            HHKAN_PROFILE.bgCategories[0].seg[0],
            HHKAN_PROFILE.bgCategories[HHKAN_PROFILE.bgCategories.length-1].seg[1]
        ]};
        const urls = getBgWallUrls(cat, HHKAN_PROFILE.perPage);
        const tint = (HHKAN_PROFILE.catTint && HHKAN_PROFILE.catTint[cat.name]) || '#7f5cff';
        grid.innerHTML = '';
        urls.forEach((url, i)=>{
            grid.appendChild(_renderBgWallItem(host, url, `${cat.icon} ${cat.name} · 随机壁纸`, tint, ()=> _bgFallbackDataUrl(cat, i)));
        });
        const total = cat.seg[1] - cat.seg[0];
        if(countEl) countEl.textContent = `${cat.icon} ${cat.name} · 已展示 ${urls.length} 张 / 共 ${total} 张 · 抽完才重置，绝不重复`;
        if(noteEl) noteEl.textContent = '💡 同一分类每次「换一批」都会重新洗牌，整类 50 张抽完才从头再来；分类之间图库完全独立，不会互相叠加。';
    }
    host.querySelector('#hhkan-uc-bg-more').addEventListener('click', ()=>{
        renderBgWall();
        const cat = bgState.cat || { name:'全部', icon:'🔥' };
        showUcToast({
            icon:'🎉', title:'已换一批壁纸',
            desc:`「${cat.icon} ${cat.name}」已重新洗牌 ${HHKAN_PROFILE.perPage} 张，均无重复`,
            colors:['#7f5cff','#5ad6ff','#6bcb77','#ffd93d','#ff6fb5','#4d96ff']
        });
    });
    renderBgCats();
    renderBgWall();

    // ===== 随机昵称（内嵌版 · 优化二：风格 / 调性 / 元素 三维筛选）=====
    // 一次生成 100 个候选形成网格，点哪个用哪个；切换任一维度即重新生成。
    const NICK_BATCH = 100;
    const nickState = { cat: null, mood: null, elem: null, current: '', history: _loadNickHistory() };
    // 渲染风格筛选条
    function renderNickCats(){
        const box = host.querySelector('#hhkan-uc-nick-cats');
        renderCatButtons(box, HHKAN_NICK_STYLES, nickState.cat, (cat)=>{
            nickState.cat = cat;
            renderNickBatch();
        });
    }
    // 渲染调性筛选条
    function renderNickMoods(){
        const box = host.querySelector('#hhkan-uc-nick-moods');
        if(!box) return;
        box.innerHTML = '';
        const all = document.createElement('button');
        all.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (!nickState.mood ? ' hhkan-pp-cat-active' : '');
        all.textContent = '不限定';
        all.addEventListener('click', ()=>{ nickState.mood = null; renderNickMoods(); renderNickBatch(); });
        box.appendChild(all);
        HHKAN_NICK_MOODS.forEach(m=>{
            const b = document.createElement('button');
            b.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (nickState.mood === m ? ' hhkan-pp-cat-active' : '');
            b.textContent = `${m.icon} ${m.name}`;
            b.addEventListener('click', ()=>{ nickState.mood = (nickState.mood === m) ? null : m; renderNickMoods(); renderNickBatch(); });
            box.appendChild(b);
        });
    }
    // 渲染元素筛选条
    function renderNickElems(){
        const box = host.querySelector('#hhkan-uc-nick-elems');
        if(!box) return;
        box.innerHTML = '';
        const all = document.createElement('button');
        all.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (!nickState.elem ? ' hhkan-pp-cat-active' : '');
        all.textContent = '不限定';
        all.addEventListener('click', ()=>{ nickState.elem = null; renderNickElems(); renderNickBatch(); });
        box.appendChild(all);
        HHKAN_NICK_ELEMS.forEach(e=>{
            const b = document.createElement('button');
            b.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (nickState.elem === e.key ? ' hhkan-pp-cat-active' : '');
            b.textContent = `${e.icon} ${e.name}`;
            b.addEventListener('click', ()=>{ nickState.elem = (nickState.elem === e.key) ? null : e.key; renderNickElems(); renderNickBatch(); });
            box.appendChild(b);
        });
    }
    // 生成一批（去重，确保 100 个互不相同）
    function renderNickBatch(){
        const grid = host.querySelector('#hhkan-uc-nick-grid');
        const big  = host.querySelector('#hhkan-uc-nick-big');
        const sub  = host.querySelector('#hhkan-uc-nick-sub');
        grid.innerHTML = '';
        const catName  = (nickState.cat  && nickState.cat.name)  || '全部风格';
        const moodName = (nickState.mood && nickState.mood.name) || '不限定';
        const elemName = (nickState.elem && (typeof nickState.elem === 'string'))
            ? (HHKAN_NICK_ELEMS.find(e=>e.key===nickState.elem)||{}).name || '不限定' : '不限定';
        const list = _genNickBatch(nickState.cat, NICK_BATCH, nickState.mood, nickState.elem);
        list.forEach(r=>{
            const t = document.createElement('span');
            t.className = 'hhkan-pp-nick-chip';
            t.textContent = r.name;
            const tags = [`「${r.group.name}」`];
            if(nickState.mood) tags.push(nickState.mood.name);
            t.title = tags.join(' · ') + ' · 点击选中';
            t.addEventListener('click', ()=>{
                nickState.current = r.name;
                big.textContent = r.name;
                sub.textContent = `📌 已选中 · ${tags.join(' · ')} · 可点「用它当昵称」`;
                grid.querySelectorAll('.hhkan-pp-nick-chip').forEach(x=> x.classList.remove('hhkan-pp-nick-active'));
                t.classList.add('hhkan-pp-nick-active');
            });
            grid.appendChild(t);
        });
        if(list.length){
            nickState.current = list[0].name;
            big.textContent = list[0].name;
            sub.textContent = `🎲 已生成 ${list.length} 个候选 · 「${catName} / ${moodName} / ${elemName}」· 点中任意一条即可选中`;
            grid.querySelector('.hhkan-pp-nick-chip')?.classList.add('hhkan-pp-nick-active');
        }
    }
    // 本地历史记录区已移除（优化四）：昵称使用记录统一在「🕘 使用记录」选择夹查看
    host.querySelector('#hhkan-uc-nick-rand').addEventListener('click', ()=>{
        renderNickBatch();
        const cn = nickState.cat ? nickState.cat.name : '全部';
        showUcToast({ icon:'🎲', title:'已生成 100 个昵称', desc:`「${cn}」风格候选已刷新，点中任意一条即可选中` });
    });
    host.querySelector('#hhkan-uc-nick-use').addEventListener('click', ()=>{
        const name = nickState.current || host.querySelector('#hhkan-uc-nick-big').textContent;
        if(!name || name === '点击下方「🎲 生成 100 个」开始') return;
        _setNick(name);
        applyProfileToPage();
        // 优化一：写入统一使用记录（昵称记录在选择夹可见）
        _pushNickHistory(name, nickState.cat ? nickState.cat.name : '随机昵称');
        // 优化一：实时刷新使用记录列表，无需重新打开面板；本地历史区已移除
        renderProfileHistory();
        showUcToast( { icon:'✏️', title:'昵称已保存', desc:`当前昵称：${name}` });
    });
    renderNickCats();
    renderNickMoods();
    renderNickElems();

    // ===== 昵称字体颜色 / 渐变色（优化二）=====
    (function bindNickColor(){
        const cfg = _getNickColor();
        const preview  = host.querySelector('#hhkan-uc-nick-color-preview');
        const c1       = host.querySelector('#hhkan-uc-nick-color1');
        const c2       = host.querySelector('#hhkan-uc-nick-color2');
        const c2Wrap   = host.querySelector('#hhkan-uc-nick-color2-wrap');
        const angle    = host.querySelector('#hhkan-uc-nick-angle');
        const angleWrap= host.querySelector('#hhkan-uc-nick-angle-wrap');
        const angleVal = host.querySelector('#hhkan-uc-nick-angle-val');
        const modes    = host.querySelectorAll('.hhkan-pp-nc-mode');
        // 初始化控件
        c1.value = cfg.color1 || '#ffffff';
        c2.value = cfg.color2 || '#a78bfa';
        angle.value = Number(cfg.angle) || 90;
        if(angleVal) angleVal.textContent = (Number(cfg.angle) || 90) + '°';
        modes.forEach(b=> b.classList.toggle('hhkan-pp-nc-mode-active', b.dataset.mode === cfg.mode));
        _toggleColor2();
        // 预览文字跟随当前昵称
        if(preview){
            const cur = (function(){ try{ return localStorage.getItem(HHKAN_PROFILE.KEY_NICK) || HHKAN_PROFILE.defaultNick; }catch(e){ return HHKAN_PROFILE.defaultNick; } })();
            preview.textContent = cur;
        }
        function _toggleColor2(){
            const show = (cfg.mode === 'gradient');
            if(c2Wrap)   c2Wrap.style.display   = show ? '' : 'none';
            if(angleWrap)angleWrap.style.display = show ? '' : 'none';
        }
        function _apply(){
            _setNickColor(cfg);
            if(preview) preview.style.cssText = _nickColorCss(cfg);
            // 同步刷新页面上的昵称显示
            applyProfileToPage();
        }
        modes.forEach(b=>{
            b.addEventListener('click', ()=>{
                cfg.mode = b.dataset.mode;
                modes.forEach(x=> x.classList.toggle('hhkan-pp-nc-mode-active', x === b));
                _toggleColor2();
                _apply();
            });
        });
        c1.addEventListener('input', ()=>{ cfg.color1 = c1.value; _apply(); });
        c2.addEventListener('input', ()=>{ cfg.color2 = c2.value; _apply(); });
        angle.addEventListener('input', ()=>{
            cfg.angle = Number(angle.value) || 0;
            if(angleVal) angleVal.textContent = cfg.angle + '°';
            _apply();
        });
        // 快捷色板：纯色模式只改颜色一；渐变模式同时改颜色二为对比色
        host.querySelectorAll('.hhkan-pp-nick-color-swatch').forEach(sw=>{
            sw.addEventListener('click', ()=>{
                const col = sw.dataset.color || '#ffffff';
                cfg.color1 = col;
                c1.value = col;
                if(cfg.mode === 'gradient'){
                    cfg.color2 = _contrastColor(col);
                    c2.value = cfg.color2;
                }
                _apply();
            });
        });
        // 随机渐变
        host.querySelector('#hhkan-uc-nick-color-random').addEventListener('click', ()=>{
            const pal = ['#ff6b6b','#ff9f43','#ffd93d','#6bcb77','#4d96ff','#5ad6ff','#7f5cff','#ff6fb5'];
            cfg.mode = 'gradient';
            cfg.color1 = pal[Math.floor(Math.random()*pal.length)];
            cfg.color2 = pal[Math.floor(Math.random()*pal.length)];
            cfg.angle  = [0,45,90,135,180,270][Math.floor(Math.random()*6)];
            c1.value = cfg.color1; c2.value = cfg.color2;
            angle.value = cfg.angle; angleVal.textContent = cfg.angle + '°';
            modes.forEach(x=> x.classList.toggle('hhkan-pp-nc-mode-active', x.dataset.mode === 'gradient'));
            _toggleColor2();
            _apply();
        });
        // 恢复默认
        host.querySelector('#hhkan-uc-nick-color-reset').addEventListener('click', ()=>{
            Object.assign(cfg, NICK_COLOR_DEFAULT);
            c1.value = cfg.color1; c2.value = cfg.color2;
            angle.value = cfg.angle; angleVal.textContent = cfg.angle + '°';
            modes.forEach(x=> x.classList.toggle('hhkan-pp-nc-mode-active', x.dataset.mode === 'solid'));
            _toggleColor2();
            _apply();
            showUcToast({ icon:'↺', title:'已恢复默认颜色', desc:'昵称颜色已重置为白色' });
        });
    })();

    // ===== 使用记录（历史记录）=====
    // ★ 记录「我设为头像 / 背景」的图片，以及使用过的昵称：每条含缩略图/昵称 + 时间 + 来源分类
    //   支持全部 / 头像 / 背景 / 昵称 筛选、点击重新应用、单条删除、一键清空
    let historyFilter = 'all';
    function renderProfileHistory(){
        const grid    = host.querySelector('#hhkan-uc-history-grid');
        const stats   = host.querySelector('#hhkan-uc-history-stats');
        const empty   = host.querySelector('#hhkan-uc-history-empty');
        if(!grid) return;
        const all = getProfileHistory();
        const list = historyFilter === 'all' ? all : all.filter(h => h.type === historyFilter);
        // 统计
        const avatars = all.filter(h => h.type === 'avatar').length;
        const bgs     = all.filter(h => h.type === 'bg').length;
        const nicks   = all.filter(h => h.type === 'nick').length;
        if(stats){
            stats.innerHTML = `
              <span class="hhkan-pp-hs-item">📋 共 <b>${all.length}</b> 条</span>
              <span class="hhkan-pp-hs-item">🤖 头像 <b>${avatars}</b> 张</span>
              <span class="hhkan-pp-hs-item">🖼️ 背景 <b>${bgs}</b> 张</span>
              <span class="hhkan-pp-hs-item">✨ 昵称 <b>${nicks}</b> 个</span>
              <span class="hhkan-pp-hs-item">🔎 当前筛选：<b>${historyFilter === 'all' ? '全部' : (historyFilter === 'avatar' ? '头像' : historyFilter === 'bg' ? '背景' : '昵称')}</b></span>
            `;
        }
        grid.innerHTML = '';
        if(list.length === 0){
            empty.hidden = false;
            empty.querySelector('.hhkan-pp-history-empty-sub').textContent =
                all.length === 0
                    ? '在「AI 头像库 / 背景图库 / 随机昵称」里使用内容，就会记录在这里'
                    : `当前筛选「${historyFilter === 'avatar' ? '头像' : historyFilter === 'bg' ? '背景' : '昵称'}」下暂无记录，切换其它筛选试试`;
            return;
        }
        empty.hidden = true;
        // 倒序：最新使用在前
        list.slice().reverse().forEach(item=>{
            const el = document.createElement('div');
            el.className = 'hhkan-pp-history-card' + (item.type === 'nick' ? ' hhkan-pp-history-card-nick' : '');
            if(item.type === 'nick'){
                // ★ 优化四：昵称记录以文字卡片呈现，可点击重新套用
                el.innerHTML = `
                  <div class="hhkan-pp-history-img hhkan-pp-history-img-nick">
                    <span class="hhkan-pp-history-nick-icon">✨</span>
                    <span class="hhkan-pp-history-tag hhkan-pp-history-tag-nick">✨ 昵称</span>
                  </div>
                  <div class="hhkan-pp-history-meta">
                    <div class="hhkan-pp-history-name hhkan-pp-history-nick-name">${item.name ? item.name.replace(/^昵称「|」$/g,'') : '昵称'}</div>
                    <div class="hhkan-pp-history-cat">📂 来自：${item.catName || '随机昵称'}</div>
                    <div class="hhkan-pp-history-time">🕘 ${_fmtHistoryTime(item.t)}</div>
                  </div>
                  <button class="hhkan-pp-history-del" title="删除这条记录">✕</button>
                `;
                el.addEventListener('click', (e)=>{
                    if(e.target.closest('.hhkan-pp-history-del')) return;
                    const nickName = (item.name || '').replace(/^昵称「|」$/g,'');
                    if(!nickName) return;
                    _setNick(nickName);
                    applyProfileToPage();
                    const input = host.querySelector('#hhkan-uc-nick');
                    if(input) input.value = nickName;
                    showUcToast({ icon:'✨', title:'昵称已恢复', desc:`「${nickName}」已从使用记录重新套用`, previewUrl:'' });
                });
            }else{
                const tagIcon = item.type === 'avatar' ? '🤖 头像' : '🖼️ 背景';
                el.innerHTML = `
                  <div class="hhkan-pp-history-img" style="background-image:url('${item.url}')">
                    <span class="hhkan-pp-history-tag hhkan-pp-history-tag-${item.type}">${tagIcon}</span>
                  </div>
                  <div class="hhkan-pp-history-meta">
                    <div class="hhkan-pp-history-name">${item.name || (item.type === 'avatar' ? '头像' : '背景图')}</div>
                    <div class="hhkan-pp-history-cat">📂 来自：${item.catName || '未分类'}</div>
                    <div class="hhkan-pp-history-time">🕘 ${_fmtHistoryTime(item.t)}</div>
                  </div>
                  <button class="hhkan-pp-history-del" title="删除这条记录">✕</button>
                `;
                el.addEventListener('click', (e)=>{
                    if(e.target.closest('.hhkan-pp-history-del')) return;
                    _applyHistoryItem(item);
                });
            }
            el.querySelector('.hhkan-pp-history-del').addEventListener('click', (e)=>{
                e.stopPropagation();
                removeProfileHistory(item.id);
                renderProfileHistory();
            });
            grid.appendChild(el);
        });
    }
    // 点击记录：重新应用到头像 / 背景
    function _applyHistoryItem(item){
        if(item.type === 'avatar'){
            _setAvatar(item.url);
            const prev = host.querySelector('#hhkan-uc-avatar-preview');
            if(prev) prev.innerHTML = `<img src="${item.url}">`;
            showUcToast({ icon:'🎨', title:'头像已恢复', desc:`「${item.catName || '头像'}」已从使用记录重新应用`, previewUrl:item.url });
        }else{
            _setBg(item.url);
            const prev = host.querySelector('#hhkan-uc-bg-preview');
            if(prev){
                prev.style.backgroundImage = `url('${item.url}')`;
                prev.querySelector('.hhkan-pp-bg-tip')?.remove();
            }
            showUcToast({ icon:'🖼️', title:'背景图已恢复', desc:'已从使用记录重新应用背景', previewUrl:item.url });
        }
        applyProfileToPage();
    }
    // 筛选
    host.querySelectorAll('.hhkan-pp-hfilter').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            host.querySelectorAll('.hhkan-pp-hfilter').forEach(x=> x.classList.remove('hhkan-pp-hfilter-active'));
            btn.classList.add('hhkan-pp-hfilter-active');
            historyFilter = btn.dataset.filter;
            renderProfileHistory();
        });
    });
    // ★ 二次确认：确定清除 / 我再想想（遮罩点击与 Esc 均等同「我再想想」）
    (async () => {
        const all = getProfileHistory();
        if (!all.length) {
            showUcToast({ icon:'ℹ️', title:'记录本就是空的', desc:'还没有使用记录可清空哦' });
            return;
        }
        const ok = await hhkanConfirm({
            title: '确认清空使用记录？',
            desc: `即将删除全部 ${all.length} 条记录，此操作不可恢复`
        });
        if (!ok) return;          // ★ 我再想想：什么都不做
        clearProfileHistory();
        renderProfileHistory();
        showUcToast({ icon:'🗑️', title:'已清空使用记录', desc:`已删除全部 ${all.length} 条记录` });
    })().catch(e => console.warn('[使用记录·内嵌] 清空确认异常：', e));
    renderProfileHistory();
    }

// ==================== 面板开关 ====================
function toggleProfilePanel(force){
    const mask = document.querySelector('#hhkan-profile-mask');
    const open = (typeof force === 'boolean') ? force : !_profilePanelOpen;
    if(open){
        if(!mask) buildProfilePanel();
        else mask.classList.add('hhkan-profile-open');
        _profilePanelOpen = true;
    }else{
        if(mask) mask.classList.remove('hhkan-profile-open');
        _profilePanelOpen = false;
    }
}

// ==================== 生成 AI 头像地址（DiceBear 多风格）====================
// style + seed 保证同一张图地址稳定可缓存；backgroundColor 按分类随机染色。
// 单图缓存键同时记入风格，避免同一 seed 跨风格被误判为重复。
function _aiUrl(styleCfg, index){
    const seed = encodeURIComponent(`${styleCfg.style}_${index}_${Math.floor(Math.random()*9999)}`);
    const bg = styleCfg.bg[Math.floor(Math.random()*styleCfg.bg.length)];
    return `https://api.dicebear.com/10.x/${styleCfg.style}/svg?seed=${seed}&backgroundColor=${bg}&radius=50`;
}
// 按分类随机一张头像 URL（供预览 / 默认头像等使用）
function _aiRandomUrl(styleCfg){
    return _aiUrl(styleCfg, Math.floor(Math.random()*4000));
}

// ==================== 构建面板 DOM ====================
function buildProfilePanel(){
    const { avatar, bg, nick } = _getProfile();
    const mask = document.createElement('div');
    mask.id = 'hhkan-profile-mask';
    mask.className = 'hhkan-profile-open';
    mask.innerHTML = `
      <div class="hhkan-profile-panel">
        <div class="hhkan-pp-head">
          <h3>装饰修改</h3>
          <button class="hhkan-pp-close" title="关闭">✕</button>
        </div>
        <div class="hhkan-pp-body">
          <!-- 预览区 -->
          <div class="hhkan-pp-preview">
            <div class="hhkan-pp-avatar-wrap">
              <div class="hhkan-pp-avatar" id="hhkan-pp-avatar-preview">${avatar ? `<img src="${avatar}">` : '<span class="hhkan-pp-avatar-emoji">🐻</span>'}</div>
              <label class="hhkan-pp-upload-btn">
                📷 上传头像
                <input type="file" id="hhkan-pp-avatar-file" accept="image/*" hidden>
              </label>
            </div>
            <div class="hhkan-pp-bg-wrap">
              <div class="hhkan-pp-bg" id="hhkan-pp-bg-preview" style="${bg ? `background-image:url('${bg}')` : ''}">
                ${bg ? '' : '<span class="hhkan-pp-bg-tip">🖼️ 暂无背景图</span>'}
              </div>
              <label class="hhkan-pp-upload-btn hhkan-pp-upload-btn-sec">
                🖼️ 上传背景图
                <input type="file" id="hhkan-pp-bg-file" accept="image/*" hidden>
              </label>
            </div>
          </div>
          <!-- 昵称 -->
          <div class="hhkan-pp-nick-row">
            <label>昵称</label>
            <input type="text" id="hhkan-pp-nick" value="${nick}" maxlength="20" placeholder="请输入昵称">
            <button id="hhkan-pp-nick-save">保存昵称</button>
          </div>
          <!-- 分区 Tabs：AI 头像库 / 背景图库 / 随机昵称 -->
          <div class="hhkan-pp-tabs">
            <button class="hhkan-pp-tab hhkan-pp-tab-active" data-tab="avatar">🤖 AI 头像库</button>
            <button class="hhkan-pp-tab" data-tab="bg">🖼️ 背景图库</button>
            <button class="hhkan-pp-tab" data-tab="nick">✨ 随机昵称</button>
            <button class="hhkan-pp-tab" data-tab="history">🕘 使用记录</button>
          </div>
          <!-- 头像库 -->
          <div class="hhkan-pp-tab-pane" data-pane="avatar">
            <div class="hhkan-pp-ai-head">
              <span>🤖 AI 绘画头像库 · 支持 ${HHKAN_PROFILE.avatarStyles.length} 种风格 · 无限生成</span>
              <span class="hhkan-pp-tip-mini">点击任意头像即可设为我的头像</span>
              <div class="hhkan-pp-cats" id="hhkan-pp-cats"></div>
            </div>
            <div class="hhkan-pp-ai-grid" id="hhkan-pp-ai-grid"></div>
            <div class="hhkan-pp-ai-more">
              <button id="hhkan-pp-ai-more">🔄 刷新</button>
              <span id="hhkan-pp-ai-count"></span>
            </div>
          </div>
          <!-- 背景图库 · 随机壁纸（内嵌 · 12 分类各 50 张 · 不叠加不重复）-->
          <!-- 背景图库 · 随机壁纸（内嵌 · 12 分类各 50 张 · 不叠加不重复） -->
          <div class="hhkan-pp-tab-pane" data-pane="bg" hidden>
            <div class="hhkan-pp-ai-head">
              <span>🖼️ 背景图库 · 随机壁纸</span>
              <span class="hhkan-pp-tip-mini">选分类出 50 张，点图即设为背景；每次「换一批」不重复，抽完才重置，分类之间互不叠加</span>
              <div class="hhkan-pp-cats" id="hhkan-pp-bg-cats"></div>
            </div>
            <div class="hhkan-pp-ai-grid hhkan-pp-bg-grid" id="hhkan-pp-bg-grid"></div>
            <div class="hhkan-pp-ai-more">
              <button id="hhkan-pp-bg-more">🔄 换一批</button>
              <span id="hhkan-pp-bg-count"></span>
            </div>
            <div class="hhkan-pp-bg-note" id="hhkan-pp-bg-note"></div>
          </div>
          <!-- 随机昵称（优化二：风格 / 调性 / 元素 三维筛选 + 字体颜色 / 渐变色） -->
          <div class="hhkan-pp-tab-pane" data-pane="nick" hidden>
            <div class="hhkan-pp-ai-head">
              <span>✨ 随机昵称 · 风格 / 调性 / 元素 三维筛选</span>
              <span class="hhkan-pp-tip-mini">先选风格定气质，再调调性 / 元素微调，一次出 100 个候选，点哪个用哪个</span>
              <div class="hhkan-pp-cats" id="hhkan-pp-nick-cats"></div>
              <div class="hhkan-pp-subcats">
                <div class="hhkan-pp-subcat">
                  <span class="hhkan-pp-subcat-label">调性</span>
                  <div class="hhkan-pp-cats hhkan-pp-cats-mini" id="hhkan-pp-nick-moods"></div>
                </div>
                <div class="hhkan-pp-subcats-line"></div>
                <div class="hhkan-pp-subcat">
                  <span class="hhkan-pp-subcat-label">元素</span>
                  <div class="hhkan-pp-cats hhkan-pp-cats-mini" id="hhkan-pp-nick-elems"></div>
                </div>
              </div>
            </div>
            <!-- ★ 优化二：昵称字体颜色 / 渐变色设置 -->
            <div class="hhkan-pp-nick-color">
              <div class="hhkan-pp-nick-color-head">
                <span class="hhkan-pp-nick-color-title">🎨 昵称字体颜色</span>
                <span class="hhkan-pp-nick-color-preview" id="hhkan-pp-nick-color-preview">好好看用户</span>
              </div>
              <div class="hhkan-pp-nick-color-modes">
                <button class="hhkan-pp-nc-mode hhkan-pp-nc-mode-active" data-mode="solid">纯色</button>
                <button class="hhkan-pp-nc-mode" data-mode="gradient">渐变色</button>
              </div>
              <div class="hhkan-pp-nick-color-body">
                <label class="hhkan-pp-nc-field">
                  <span>颜色一</span>
                  <input type="color" id="hhkan-pp-nick-color1" value="#ffffff">
                </label>
                <label class="hhkan-pp-nc-field" id="hhkan-pp-nick-color2-wrap">
                  <span>颜色二</span>
                  <input type="color" id="hhkan-pp-nick-color2" value="#a78bfa">
                </label>
                <label class="hhkan-pp-nc-field" id="hhkan-pp-nick-angle-wrap">
                  <span>渐变角度 <b id="hhkan-pp-nick-angle-val">90°</b></span>
                  <input type="range" id="hhkan-pp-nick-angle" min="0" max="360" value="90">
                </label>
              </div>
              <div class="hhkan-pp-nick-color-actions">
                <button class="hhkan-pp-nick-color-swatch" data-color="#ffffff" title="纯白"></button>
                <button class="hhkan-pp-nick-color-swatch" data-color="#f5c518" title="金黄"></button>
                <button class="hhkan-pp-nick-color-swatch" data-color="#7f5cff" title="紫"></button>
                <button class="hhkan-pp-nick-color-swatch" data-color="#5ad6ff" title="天蓝"></button>
                <button class="hhkan-pp-nick-color-swatch" data-color="#6bcb77" title="绿"></button>
                <button class="hhkan-pp-nick-color-swatch" data-color="#ff6fb5" title="粉"></button>
                <button class="hhkan-pp-nick-color-swatch" data-color="#ff9f43" title="橙"></button>
                <button class="hhkan-pp-nick-color-swatch" data-color="#ff6b6b" title="红"></button>
                <button class="hhkan-pp-nick-color-random" id="hhkan-pp-nick-color-random" title="随机渐变">🎲 随机渐变</button>
                <button class="hhkan-pp-nick-color-reset" id="hhkan-pp-nick-color-reset">恢复默认</button>
              </div>
            </div>
            <div class="hhkan-pp-nick-result">
              <div class="hhkan-pp-nick-big" id="hhkan-pp-nick-big">点击下方「🎲 生成 100 个」开始</div>
              <div class="hhkan-pp-nick-sub" id="hhkan-pp-nick-sub">支持 7 种风格 · 点中任意昵称即可选中</div>
            </div>
            <div class="hhkan-pp-nick-grid" id="hhkan-pp-nick-grid"></div>
            <div class="hhkan-pp-nick-actions">
              <button class="hhkan-pp-nick-rand" id="hhkan-pp-nick-rand">🎲 生成 100 个</button>
              <button class="hhkan-pp-nick-use"  id="hhkan-pp-nick-use">✅ 用它当昵称</button>
            </div>
            <div class="hhkan-pp-nick-history-note">📌 昵称保存后会出现在右侧「🕘 使用记录」选择夹的「✨ 昵称」筛选里，无需额外记录夹</div>
          </div>
          <!-- 使用记录（历史记录）：记录「我设为头像 / 背景」的图片 -->
          <div class="hhkan-pp-tab-pane" data-pane="history" hidden>
            <div class="hhkan-pp-ai-head">
              <span>🕘 使用记录 · 记录你设为头像 / 背景的图片，以及使用过的昵称</span>
              <span class="hhkan-pp-tip-mini">点击卡片可重新应用；昵称记录点 ✕ 可删除</span>
              <div class="hhkan-pp-history-toolbar">
                <div class="hhkan-pp-history-filter" id="hhkan-pp-history-filter">
                  <button class="hhkan-pp-hfilter hhkan-pp-hfilter-active" data-filter="all">全部</button>
                  <button class="hhkan-pp-hfilter" data-filter="avatar">🤖 头像</button>
                  <button class="hhkan-pp-hfilter" data-filter="bg">🖼️ 背景</button>
                  <button class="hhkan-pp-hfilter" data-filter="nick">✨ 昵称</button>
                </div>
                <button class="hhkan-pp-history-clear" id="hhkan-pp-history-clear">🗑️ 清空记录</button>
              </div>
            </div>
            <div class="hhkan-pp-history-stats" id="hhkan-pp-history-stats"></div>
            <div class="hhkan-pp-history-empty" id="hhkan-pp-history-empty" hidden>
              <div class="hhkan-pp-history-empty-icon">🕘</div>
              <div class="hhkan-pp-history-empty-text">还没有使用记录</div>
              <div class="hhkan-pp-history-empty-sub">在「AI 头像库 / 背景图库」里点击图片设为头像或背景，就会记录在这里</div>
            </div>
            <div class="hhkan-pp-ai-grid" id="hhkan-pp-history-grid"></div>
          </div>
        </div>
      </div>
      <!-- ★ 精美结果弹窗：上传头像 / 上传背景 / 保存昵称 完成后弹出 -->
      <div class="hhkan-pp-toast-mask" id="hhkan-pp-toast" hidden>
        <div class="hhkan-pp-toast">
          <div class="hhkan-pp-toast-ring"></div>
          <div class="hhkan-pp-toast-ring2"></div>
          <div class="hhkan-pp-toast-burst"></div>
          <div class="hhkan-pp-toast-icon" id="hhkan-pp-toast-icon">✅</div>
          <div class="hhkan-pp-toast-confetti"></div>
          <div class="hhkan-pp-toast-title" id="hhkan-pp-toast-title">保存成功</div>
          <div class="hhkan-pp-toast-desc" id="hhkan-pp-toast-desc">资料已更新</div>
          <div class="hhkan-pp-toast-preview" id="hhkan-pp-toast-preview"></div>
          <button class="hhkan-pp-toast-btn" id="hhkan-pp-toast-btn">我知道了</button>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    bindProfilePanelEvents(mask);
    // 默认激活「头像库」Tab
    _profileTab = 'avatar';
    renderCategories(mask);
    renderBgCategories(mask);
    renderNickCategories(mask);
    _renderNickMoodsPanel(mask);
    _renderNickElemsPanel(mask);
    renderNickHistory(mask);
    renderAiGrid(mask, 0);
    // ★ 背景图库：随机壁纸（内嵌 · 12 分类各 50 张 · 不叠加不重复）
    renderBgGridPanel(mask);
    renderProfileHistoryPanel(mask);
    // ★ 优化二：绑定昵称字体颜色 / 渐变色
    bindNickColorPanel(mask);

    mask.querySelector('.hhkan-pp-close').addEventListener('click', ()=> toggleProfilePanel(false));
    mask.addEventListener('click', (e)=>{ if(e.target === mask) toggleProfilePanel(false); });
}

let _aiState = { cat: null, batch: 0 };
let _profileTab = 'avatar';   // 当前激活分区：avatar / bg / nick
let _bgState = { cat: null, page: 0, batch: 0, lock: false, seen: new Set() };  // 背景图分页加载状态（seen 用于去重，保证不重复出图）
let _nickState = { cat: null, mood: null, elem: null, current: '', history: [] };  // 随机昵称状态（优化二：风格/调性/元素）
let _toastTimer = null;                                      // 弹窗自动关闭定时器

// ==================== 精美结果弹窗 ====================
// 供「上传头像 / 上传背景图 / 保存昵称」三个按钮统一调用；
// 支持自定义图标、标题、描述、预览图，带缩放 + 淡入 + 图标弹跳动画。
// ==================== 精美结果弹窗 ====================
// 供「上传头像 / 上传背景图 / 保存昵称」三个按钮统一调用；
// 支持自定义图标、标题、描述、预览图，带缩放 + 淡入 + 光环扩散 + 图标弹跳 +
// 彩色碎片粒子动画，遮罩点击 / 按钮 / 回车 / Esc 均可关闭。
function showProfileToast(mask, opt){
    opt = opt || {};
    const toast = mask.querySelector('#hhkan-pp-toast');
    if(!toast) return;
    const icon = toast.querySelector('#hhkan-pp-toast-icon');
    const title = toast.querySelector('#hhkan-pp-toast-title');
    const desc = toast.querySelector('#hhkan-pp-toast-desc');
    const preview = toast.querySelector('#hhkan-pp-toast-preview');
    const btn = toast.querySelector('#hhkan-pp-toast-btn');

    // 内容填充
    icon.textContent = opt.icon || '✅';
    title.textContent = opt.title || '操作成功';
    desc.textContent = opt.desc || '';
    // 根据类型切主题色（成功 / 警告 / 失败）
    let tone = 'ok';
    if(/失败|不能为空|太长|不对/.test(opt.title || '')) tone = 'bad';
    else if(/警告|太大|重试/.test(opt.title || '')) tone = 'warn';
    toast.dataset.tone = tone;
    // 预览图：有图则显示，无图则隐藏
    if(opt.previewUrl){
        preview.style.backgroundImage = `url("${opt.previewUrl}")`;
        preview.hidden = false;
    }else{
        preview.hidden = true;
        preview.style.backgroundImage = '';
    }

    // 显示 + 动画：先重置再触发，保证重复点击也能重播
    toast.hidden = false;
    toast.classList.remove('hhkan-pp-toast-hide');
    const box = toast.querySelector('.hhkan-pp-toast');
    if(box){
        box.style.animation = 'none';
        void box.offsetWidth;
        box.style.animation = '';
    }
    icon.style.animation = 'none';
    void icon.offsetWidth;
    icon.style.animation = '';
    const ring = box.querySelector('.hhkan-pp-toast-ring');
    if(ring){ ring.style.animation = 'none'; void ring.offsetWidth; ring.style.animation = ''; }
    const ring2 = box.querySelector('.hhkan-pp-toast-ring2');
    if(ring2){ ring2.style.animation = 'none'; void ring2.offsetWidth; ring2.style.animation = ''; }
    const burst = box.querySelector('.hhkan-pp-toast-burst');
    if(burst){ burst.style.animation = 'none'; void burst.offsetWidth; burst.style.animation = ''; }
    // 成功类才撒彩色粒子，警告/失败类只做简单淡入
    const confetti = box.querySelector('.hhkan-pp-toast-confetti');
    if(confetti){
        confetti.innerHTML = '';
        if(tone === 'ok'){
            const colors = (opt.colors && opt.colors.length) ? opt.colors
                : ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6fb5','#7f5cff','#5ad6ff','#ff9f43'];
            const N = 24;
            for(let i=0;i<N;i++){
                const s = document.createElement('span');
                const angle = (360 / N) * i + (Math.random()*18 - 9);
                const dist  = 62 + Math.random()*30;
                const color = colors[i % colors.length];
                const size  = 5 + Math.random()*5;
                const dur   = (620 + Math.random()*320).toFixed(0) + 'ms';
                const delay = (i * 12).toFixed(0) + 'ms';
                s.style.cssText = `
                    left:50%;top:44%;width:${size}px;height:${size*1.35}px;
                    background:${color};
                    --tx:${Math.cos(angle*Math.PI/180)*dist}px;
                    --ty:${Math.sin(angle*Math.PI/180)*dist}px;
                    animation:hhkanPpConfetti ${dur} ${delay} cubic-bezier(.22,.7,.35,1) forwards;
                `;
                confetti.appendChild(s);
            }
        }
    }

    // 自动关闭（成功类 2.6s，警告类 3.6s，失败类不自动关）
    clearTimeout(_toastTimer);
    if(tone !== 'bad'){
        _toastTimer = setTimeout(()=>{
            toast.classList.add('hhkan-pp-toast-hide');
            setTimeout(()=>{ toast.hidden = true; }, 260);
        }, tone === 'warn' ? 3600 : 2600);
    }
    // 回车也可确认
    const onKey = (e)=>{
        if(e.key === 'Enter' || e.key === 'Escape'){
            e.preventDefault();
            clearTimeout(_toastTimer);
            toast.classList.add('hhkan-pp-toast-hide');
            setTimeout(()=>{ toast.hidden = true; }, 260);
            btn?.removeEventListener('click', onKey);
        }
    };
    btn?.addEventListener('click', onKey);
}

// ==================== 通用分类渲染 ====================
// 把分类数组渲染成 tab 按钮，点击后回调 onPick（传 cat 或 null=全部）
function renderCatButtons(box, list, activeCat, onPick){
    box.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'hhkan-pp-cat' + (activeCat === null ? ' hhkan-pp-cat-active' : '');
    allBtn.innerHTML = '🔥 全部';
    allBtn.addEventListener('click', ()=>{
        box.querySelectorAll('.hhkan-pp-cat').forEach(x=> x.classList.remove('hhkan-pp-cat-active'));
        allBtn.classList.add('hhkan-pp-cat-active');
        onPick(null, allBtn);
    });
    box.appendChild(allBtn);
    list.forEach(cat=>{
        const b = document.createElement('button');
        b.className = 'hhkan-pp-cat';
        b.innerHTML = `${cat.icon} ${cat.name}`;
        b.addEventListener('click', ()=>{
            box.querySelectorAll('.hhkan-pp-cat').forEach(x=> x.classList.remove('hhkan-pp-cat-active'));
            b.classList.add('hhkan-pp-cat-active');
            onPick(cat, b);
        });
        box.appendChild(b);
    });
}

// ---- 头像库分类 ----
function renderCategories(mask){
    renderCatButtons(mask.querySelector('#hhkan-pp-cats'), HHKAN_PROFILE.avatarStyles, _aiState.cat, (cat)=> switchCat(mask, cat));
}
// ---- 背景图分类 ----
function renderBgCategories(mask){
    renderCatButtons(mask.querySelector('#hhkan-pp-bg-cats'), HHKAN_PROFILE.bgCategories, _bgState.cat, (cat)=> switchBgCat(mask, cat));
}
// ---- 随机昵称分类 ----
function renderNickCategories(mask){
    renderCatButtons(mask.querySelector('#hhkan-pp-nick-cats'), HHKAN_NICK_GROUPS, _nickState.cat, (cat)=> switchNickCat(mask, cat));
}
function switchCat(mask, cat){
    _aiState.cat = cat;
    _aiState.batch = 0;
    renderAiGrid(mask, 0);
}
function renderAiGrid(mask, startIdx){
    const grid = mask.querySelector('#hhkan-pp-ai-grid');
    const countEl = mask.querySelector('#hhkan-pp-ai-count');
    // 「全部」时遍历全部风格，保证分类感；选风格时只出该风格
    const cats = _aiState.cat ? [_aiState.cat] : HHKAN_PROFILE.avatarStyles;
    if(startIdx === 0) grid.innerHTML = '';

    // ★ 每个分类固定出 50 张（perPage=50），用 batch 作偏移保证每批不同
    const perCat = Math.max(1, Math.ceil(HHKAN_PROFILE.perPage / cats.length));
    const usedCat = _aiState.cat || { name:'全部', icon:'🔥' };
    let rendered = 0;
    cats.forEach(cat=>{
        for(let i=0;i<perCat;i++){
            if(startIdx === 0 && rendered >= HHKAN_PROFILE.perPage) break;
            const url = _aiUrl(cat, _aiState.batch * perCat + i);
            const item = document.createElement('div');
            item.className = 'hhkan-pp-ai-item';
            item.style.backgroundImage = `url("${url}")`;
            item.title = `${cat.name} · AI 头像`;
            item.addEventListener('click', ()=>{
                // 点击即设为头像
                _setAvatar(url);
                applyProfileToPage();
                const prev = mask.querySelector('#hhkan-pp-avatar-preview');
                prev.innerHTML = `<img src="${url}">`;
                mask.querySelectorAll('.hhkan-pp-ai-item').forEach(x=> x.classList.remove('hhkan-pp-ai-active'));
                item.classList.add('hhkan-pp-ai-active');
                // ★ 记录到使用记录（历史记录）
                addProfileHistory({ type:'avatar', url:url, name:`「${usedCat.name}」风格头像`, catName:usedCat.name });
                showProfileToast(mask, {
                    icon:'🎨', title:'AI 头像已应用',
                    desc:`「${usedCat.name}」风格头像已同步到个人主页与头部`,
                    previewUrl:url
                });
            });
            grid.appendChild(item);
            rendered++;
        }
    });
    if(countEl) countEl.textContent = `已展示 ${rendered.toLocaleString()} 张 · 第 ${_aiState.batch + 1} 批（${usedCat.name}）`;
    const moreBtn = mask.querySelector('#hhkan-pp-ai-more');
    if(moreBtn) moreBtn.disabled = false;   // DiceBear 可无限换批
}

// ==================== 背景图库 · 随机壁纸（内嵌 · 12 分类各 50 张 · 不叠加不重复）====================
// 分类按钮切换后，从该类独占的 seed 区间按「洗牌队列」取 perPage 张，
// 每张 seed 在本生命周期内只出现一次；网络不通时降级为本地 SVG 渐变兜底。
let _ppBgState = { cat: null };
function _ppBgAllCat(){
    const cats = HHKAN_PROFILE.bgCategories;
    return { name:'全部', icon:'🔥', seg:[cats[0].seg[0], cats[cats.length-1].seg[1]] };
}
function renderBgCategories(mask){
    const box = mask.querySelector('#hhkan-pp-bg-cats');
    if(!box) return;
    const list = [_ppBgAllCat(), ...HHKAN_PROFILE.bgCategories];
    renderCatButtons(box, list, _ppBgState.cat, (cat)=>{
        _ppBgState.cat = cat; renderBgGridPanel(mask);
    });
}
function renderBgGridPanel(mask){
    const grid = mask.querySelector('#hhkan-pp-bg-grid');
    const countEl = mask.querySelector('#hhkan-pp-bg-count');
    const noteEl = mask.querySelector('#hhkan-pp-bg-note');
    const cat = _ppBgState.cat || _ppBgAllCat();
    const urls = getBgWallUrls(cat, HHKAN_PROFILE.perPage);
    const tint = (HHKAN_PROFILE.catTint && HHKAN_PROFILE.catTint[cat.name]) || '#7f5cff';
    grid.innerHTML = '';
    urls.forEach((url, i)=>{
        grid.appendChild(_renderBgWallItem(mask, url, `${cat.icon} ${cat.name} · 随机壁纸`, tint, ()=> _bgFallbackDataUrl(cat, i)));
    });
    const total = cat.seg[1] - cat.seg[0];
    if(countEl) countEl.textContent = `${cat.icon} ${cat.name} · 已展示 ${urls.length} 张 / 共 ${total} 张 · 抽完才重置，绝不重复`;
    if(noteEl) noteEl.textContent = '💡 同一分类每次「换一批」都会重新洗牌，整类 50 张抽完才从头再来；分类之间图库完全独立，不会互相叠加。';
}


// ==================== 随机昵称（网名 + 风格 / 调性 / 元素 三维分类）====================
// ★ 优化二：生成器按「风格 → 长度档位 → 调性 → 元素」逐级控制气质与构成。
//   NICK_BATCH 个候选一次成型，点哪个用哪个。
const NICK_BATCH = 100;

// 按风格长度档位生成符合目标字数的名称
function _genNickByStyle(g){
    const pick = a => a[Math.floor(Math.random()*a.length)];
    let name = '';
    const pre = pick(g.pre), mid = pick(g.mid), suf = pick(g.suf);
    if(g.len === 's'){
        // 短：2～4 字，多取「单字前缀 + 单字后缀」或直接前缀
        const mode = Math.random();
        name = mode < 0.34 ? pre : (mode < 0.67 ? pre + suf : pre + mid);
        if(name.length > 4) name = (pre + suf).slice(0, 3 + Math.floor(Math.random()*2));
    }else if(g.len === 'm'){
        // 中：4～6 字
        name = pre + mid + suf;
        if(name.length > 6) name = (pre + mid).slice(0, 6) || pre;
    }else{
        // 长：6～10 字，拼接两次以贴近古风意境
        const pre2 = pick(g.pre);
        name = pre + mid + suf + (Math.random() < 0.5 ? mid : '') + (pre !== pre2 ? pre2.slice(0,2) : '');
        if(name.length > 10) name = name.slice(0, 8 + Math.floor(Math.random()*3));
    }
    return name;
}

// 按调性为名称追加/替换一个情绪字，让整体气质向该调性靠拢
function _applyMood(name, mood){
    if(!mood || !mood.words || !mood.words.length) return name;
    const pick = a => a[Math.floor(Math.random()*a.length)];
    const w = pick(mood.words);
    const r = Math.random();
    if(r < 0.5) return name + w;            // 后缀追加
    if(r < 0.75) return w + name;           // 前缀追加
    return name.replace(/.$/, w);           // 末尾替换
}

// 按元素开关过滤/修正名称构成（mood 调性已决定是否带情绪意象）
function _applyElem(name, elem, group){
    if(!elem || elem === 'mood') return name;
    const has = s => /[a-zA-Z]/.test(s);
    const hasNum = s => /[0-9]/.test(s);
    const isCJK = s => /[\u4e00-\u9fa5]/.test(s);
    const pick = a => a[Math.floor(Math.random()*a.length)];
    switch(elem){
        case 'en':      return has(name) ? name : (pick(group.pre).replace(/[^\x00-\x7F]/g,'') || 'Nova') + name.slice(0,2);
        case 'num':     return name + pick(['77','404','2025','521','1314','99','07','21','365','0x7F']);
        case 'sym':     return pick(['★','♡','☾','✦','♪','☁','✿','♛']) + name + pick(['✦','♡','☾','♪','✿','☯']);
        case 'suffix':  return name + pick(['酱','君','sama','子','大人','酱酱','さん']);
        case 'gufeng':  return isCJK(name) ? name.replace(/.$/, pick(['客','归','愁','梦','雪','酒','弦','舟','书','尘'])) : name;
        case 'text':
        default:        return hasNum(name) && isCJK(name) ? name.replace(/[0-9]+/, '') : name;
    }
}

// 生成单个昵称：style 必选，mood / elem 可选
function _genNick(cat, mood, elem){
    const g = cat || HHKAN_NICK_STYLES[Math.floor(Math.random()*HHKAN_NICK_STYLES.length)];
    let name = _genNickByStyle(g);
    if(mood) name = _applyMood(name, mood);
    if(elem) name = _applyElem(name, elem, g);
    // 最终长度收敛到 2～10 字
    if(name.length > 10) name = name.slice(0, 8 + Math.floor(Math.random()*3));
    if(!name) name = (g.pre[0] || '昵称') + (g.suf[0] || '');
    return { name, group: g, mood: mood || null, elem: elem || null };
}

// 批量生成（去重，保证 100 个互不相同）
function _genNickBatch(cat, n, mood, elem){
    const set = new Set();
    const list = [];
    let guard = 0;
    while(list.length < n && guard < n * 30){
        guard++;
        const r = _genNick(cat, mood, elem);
        if(set.has(r.name)) continue;
        set.add(r.name);
        list.push(r);
    }
    return list;
}
function switchNickCat(mask, cat){
    _nickState.cat = cat;
    renderNickBatch(mask);
}
function renderNickBatch(mask){
    const grid = mask.querySelector('#hhkan-pp-nick-grid');
    const big  = mask.querySelector('#hhkan-pp-nick-big');
    const sub  = mask.querySelector('#hhkan-pp-nick-sub');
    if(!grid) return;
    grid.innerHTML = '';
    const catName  = (_nickState.cat  && _nickState.cat.name)  || '全部风格';
    const moodName = (_nickState.mood && _nickState.mood.name) || '不限定';
    const elemName = (_nickState.elem && (typeof _nickState.elem === 'string'))
        ? (HHKAN_NICK_ELEMS.find(e=>e.key===_nickState.elem)||{}).name || '不限定' : '不限定';
    const list = _genNickBatch(_nickState.cat, NICK_BATCH, _nickState.mood, _nickState.elem);
    list.forEach(r=>{
        const t = document.createElement('span');
        t.className = 'hhkan-pp-nick-chip';
        t.textContent = r.name;
        const tags = [`「${r.group.name}」`];
        if(_nickState.mood) tags.push(_nickState.mood.name);
        t.title = tags.join(' · ') + ' · 点击选中';
        t.addEventListener('click', ()=>{
            _nickState.current = r.name;
            if(big) big.textContent = r.name;
            if(sub) sub.textContent = `📌 已选中 · ${tags.join(' · ')} · 可点「用它当昵称」`;
            grid.querySelectorAll('.hhkan-pp-nick-chip').forEach(x=> x.classList.remove('hhkan-pp-nick-active'));
            t.classList.add('hhkan-pp-nick-active');
        });
        grid.appendChild(t);
    });
    if(list.length){
        _nickState.current = list[0].name;
        if(big) big.textContent = list[0].name;
        if(sub) sub.textContent = `🎲 已生成 ${list.length} 个候选 · 「${catName} / ${moodName} / ${elemName}」· 点中任意一条即可选中`;
        grid.querySelector('.hhkan-pp-nick-chip')?.classList.add('hhkan-pp-nick-active');
    }
}
// 渲染调性筛选条（面板版）
function _renderNickMoodsPanel(mask){
    const box = mask.querySelector('#hhkan-pp-nick-moods');
    if(!box) return;
    box.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (!_nickState.mood ? ' hhkan-pp-cat-active' : '');
    all.textContent = '不限定';
    all.addEventListener('click', ()=>{ _nickState.mood = null; _renderNickMoodsPanel(mask); renderNickBatch(mask); });
    box.appendChild(all);
    HHKAN_NICK_MOODS.forEach(m=>{
        const b = document.createElement('button');
        b.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (_nickState.mood === m ? ' hhkan-pp-cat-active' : '');
        b.textContent = `${m.icon} ${m.name}`;
        b.addEventListener('click', ()=>{ _nickState.mood = (_nickState.mood === m) ? null : m; _renderNickMoodsPanel(mask); renderNickBatch(mask); });
        box.appendChild(b);
    });
}
// 渲染元素筛选条（面板版）
function _renderNickElemsPanel(mask){
    const box = mask.querySelector('#hhkan-pp-nick-elems');
    if(!box) return;
    box.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (!_nickState.elem ? ' hhkan-pp-cat-active' : '');
    all.textContent = '不限定';
    all.addEventListener('click', ()=>{ _nickState.elem = null; _renderNickElemsPanel(mask); renderNickBatch(mask); });
    box.appendChild(all);
    HHKAN_NICK_ELEMS.forEach(e=>{
        const b = document.createElement('button');
        b.className = 'hhkan-pp-cat hhkan-pp-cat-mini' + (_nickState.elem === e.key ? ' hhkan-pp-cat-active' : '');
        b.textContent = `${e.icon} ${e.name}`;
        b.addEventListener('click', ()=>{ _nickState.elem = (_nickState.elem === e.key) ? null : e.key; _renderNickElemsPanel(mask); renderNickBatch(mask); });
        box.appendChild(b);
    });
}
// 优化一：独立昵称历史区已移除，昵称记录统一走「使用记录」选择夹；
// 此函数保留为空壳，避免旧引用报错。
function renderNickHistory(mask){ /* noop */ }

// ==================== 使用记录（历史记录）· 抽屉版 ====================
// ★ 记录「我设为头像 / 背景」的图片，以及使用过的昵称：每条含缩略图/昵称 + 时间 + 来源分类
function renderProfileHistoryPanel(mask){
    if(!mask) return;
    let filter = 'all';
    const grid  = mask.querySelector('#hhkan-pp-history-grid');
    const stats = mask.querySelector('#hhkan-pp-history-stats');
    const empty = mask.querySelector('#hhkan-pp-history-empty');
    if(!grid) return;
    function render(){
        const all = getProfileHistory();
        const list = filter === 'all' ? all : all.filter(h => h.type === filter);
        const avatars = all.filter(h => h.type === 'avatar').length;
        const bgs     = all.filter(h => h.type === 'bg').length;
        const nicks   = all.filter(h => h.type === 'nick').length;
        if(stats){
            stats.innerHTML = `
              <span class="hhkan-pp-hs-item">📋 共 <b>${all.length}</b> 条</span>
              <span class="hhkan-pp-hs-item">🤖 头像 <b>${avatars}</b> 张</span>
              <span class="hhkan-pp-hs-item">🖼️ 背景 <b>${bgs}</b> 张</span>
              <span class="hhkan-pp-hs-item">✨ 昵称 <b>${nicks}</b> 个</span>
              <span class="hhkan-pp-hs-item">🔎 当前筛选：<b>${filter === 'all' ? '全部' : (filter === 'avatar' ? '头像' : filter === 'bg' ? '背景' : '昵称')}</b></span>
            `;
        }
        grid.innerHTML = '';
        if(list.length === 0){
            empty.hidden = false;
            empty.querySelector('.hhkan-pp-history-empty-sub').textContent =
                all.length === 0
                    ? '在「AI 头像库 / 背景图库 / 随机昵称」里使用内容，就会记录在这里'
                    : `当前筛选「${filter === 'avatar' ? '头像' : filter === 'bg' ? '背景' : '昵称'}」下暂无记录，切换其它筛选试试`;
            return;
        }
        empty.hidden = true;
        list.slice().reverse().forEach(item=>{
            const el = document.createElement('div');
            el.className = 'hhkan-pp-history-card' + (item.type === 'nick' ? ' hhkan-pp-history-card-nick' : '');
            if(item.type === 'nick'){
                // ★ 优化四：昵称记录以文字卡片呈现，可点击重新套用
                el.innerHTML = `
                  <div class="hhkan-pp-history-img hhkan-pp-history-img-nick">
                    <span class="hhkan-pp-history-nick-icon">✨</span>
                    <span class="hhkan-pp-history-tag hhkan-pp-history-tag-nick">✨ 昵称</span>
                  </div>
                  <div class="hhkan-pp-history-meta">
                    <div class="hhkan-pp-history-name hhkan-pp-history-nick-name">${item.name ? item.name.replace(/^昵称「|」$/g,'') : '昵称'}</div>
                    <div class="hhkan-pp-history-cat">📂 来自：${item.catName || '随机昵称'}</div>
                    <div class="hhkan-pp-history-time">🕘 ${_fmtHistoryTime(item.t)}</div>
                  </div>
                  <button class="hhkan-pp-history-del" title="删除这条记录">✕</button>
                `;
                el.addEventListener('click', (e)=>{
                    if(e.target.closest('.hhkan-pp-history-del')) return;
                    const nickName = (item.name || '').replace(/^昵称「|」$/g,'');
                    if(!nickName) return;
                    _setNick(nickName);
                    applyProfileToPage();
                    const input = mask.querySelector('#hhkan-pp-nick');
                    if(input) input.value = nickName;
                    showProfileToast(mask, { icon:'✨', title:'昵称已恢复', desc:`「${nickName}」已从使用记录重新套用`, previewUrl:'' });
                });
            }else{
                const tagIcon = item.type === 'avatar' ? '🤖 头像' : '🖼️ 背景';
                el.innerHTML = `
                  <div class="hhkan-pp-history-img" style="background-image:url('${item.url}')">
                    <span class="hhkan-pp-history-tag hhkan-pp-history-tag-${item.type}">${tagIcon}</span>
                  </div>
                  <div class="hhkan-pp-history-meta">
                    <div class="hhkan-pp-history-name">${item.name || (item.type === 'avatar' ? '头像' : '背景图')}</div>
                    <div class="hhkan-pp-history-cat">📂 来自：${item.catName || '未分类'}</div>
                    <div class="hhkan-pp-history-time">🕘 ${_fmtHistoryTime(item.t)}</div>
                  </div>
                  <button class="hhkan-pp-history-del" title="删除这条记录">✕</button>
                `;
                el.addEventListener('click', (e)=>{
                    if(e.target.closest('.hhkan-pp-history-del')) return;
                    if(item.type === 'avatar'){
                        _setAvatar(item.url);
                        const prev = mask.querySelector('#hhkan-pp-avatar-preview');
                        if(prev) prev.innerHTML = `<img src="${item.url}">`;
                        showProfileToast(mask, { icon:'🎨', title:'头像已恢复', desc:`「${item.catName || '头像'}」已从使用记录重新应用`, previewUrl:item.url });
                    }else{
                        _setBg(item.url);
                        const prev = mask.querySelector('#hhkan-pp-bg-preview');
                        if(prev){
                            prev.style.backgroundImage = `url('${item.url}')`;
                            prev.querySelector('.hhkan-pp-bg-tip')?.remove();
                        }
                        showProfileToast(mask, { icon:'🖼️', title:'背景图已恢复', desc:'已从使用记录重新应用背景', previewUrl:item.url });
                    }
                    applyProfileToPage();
                });
            }
            el.querySelector('.hhkan-pp-history-del').addEventListener('click', (e)=>{
                e.stopPropagation();
                removeProfileHistory(item.id);
                render();
            });
            grid.appendChild(el);
        });
    }
    // 筛选
    mask.querySelectorAll('.hhkan-pp-hfilter').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            mask.querySelectorAll('.hhkan-pp-hfilter').forEach(x=> x.classList.remove('hhkan-pp-hfilter-active'));
            btn.classList.add('hhkan-pp-hfilter-active');
            filter = btn.dataset.filter;
            render();
        });
    });
    // ★ 二次确认：确定清除 / 我再想想（遮罩点击与 Esc 均等同「我再想想」）
    clearBtn.addEventListener('click', async () => {
        const all = getProfileHistory();
        if (!all.length) {
            showProfileToast(mask, { icon:'ℹ️', title:'记录本就是空的', desc:'还没有使用记录可清空哦' });
            return;
        }
        const ok = await hhkanConfirm({
            title: '确认清空使用记录？',
            desc: `即将删除全部 ${all.length} 条记录，此操作不可恢复`
        });
        if (!ok) return;          // ★ 我再想想：什么都不做
        clearProfileHistory();
        render();
        showProfileToast(mask, { icon:'🗑️', title:'已清空使用记录', desc:`已删除全部 ${all.length} 条记录` });
    });
    render();
}

function bindProfilePanelEvents(mask){
    // ==================== Tab 切换 ====================
    mask.querySelectorAll('.hhkan-pp-tab').forEach(tab=>{
        tab.addEventListener('click', ()=>{
            const target = tab.dataset.tab;
            _profileTab = target;
            mask.querySelectorAll('.hhkan-pp-tab').forEach(t=> t.classList.toggle('hhkan-pp-tab-active', t===tab));
            mask.querySelectorAll('.hhkan-pp-tab-pane').forEach(p=>{
                p.hidden = (p.dataset.pane !== target);
            });
        });
    });

    // ==================== 上传头像 ====================
    mask.querySelector('#hhkan-pp-avatar-file').addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        // 校验类型 / 大小（最大 3MB，避免 localStorage 爆满）
        if(!/^image\//.test(file.type)){
            return showProfileToast(mask, { icon:'⚠️', title:'格式不对', desc:'请选择图片文件（JPG / PNG / GIF 等）' });
        }
        if(file.size > 3*1024*1024){
            return showProfileToast(mask, { icon:'⚠️', title:'图片太大', desc:'请选择 3MB 以内的图片，否则可能保存失败' });
        }
        try{
            const data = await _readFileAsDataURL(file);
            _setAvatar(data);
            applyProfileToPage();
            mask.querySelector('#hhkan-pp-avatar-preview').innerHTML = `<img src="${data}">`;
            showProfileToast(mask, {
                icon:'🎉', title:'头像上传成功',
                desc:'你的专属头像已焕新，个人主页与头部同步更新',
                previewUrl:data,
                colors:['#7f5cff','#5ad6ff','#4d96ff','#6bcb77','#ffd93d','#ff6fb5']
            });
        }catch(err){
            showProfileToast(mask, { icon:'😢', title:'上传失败', desc:'图片读取失败，请重试' });
        }
    });

    // ==================== 上传背景图 ====================
    mask.querySelector('#hhkan-pp-bg-file').addEventListener('change', async (e)=>{
        const file = e.target.files[0];
        if(!file) return;
        if(!/^image\//.test(file.type)){
            return showProfileToast(mask, { icon:'⚠️', title:'格式不对', desc:'请选择图片文件（JPG / PNG / GIF 等）' });
        }
        if(file.size > 3*1024*1024){
            return showProfileToast(mask, { icon:'⚠️', title:'图片太大', desc:'请选择 3MB 以内的图片，否则可能保存失败' });
        }
        try{
            const data = await _readFileAsDataURL(file);
            _setBg(data);
            applyProfileToPage();
            const prev = mask.querySelector('#hhkan-pp-bg-preview');
            prev.style.backgroundImage = `url('${data}')`;
            prev.querySelector('.hhkan-pp-bg-tip')?.remove();
            showProfileToast(mask, {
                icon:'🌈', title:'背景图上传成功',
                desc:'个人主页背景已实时刷新，看看效果吧',
                previewUrl:data,
                colors:['#ff9f43','#ff6b6b','#ff6fb5','#7f5cff','#5ad6ff','#6bcb77']
            });
        }catch(err){
            showProfileToast(mask, { icon:'😢', title:'上传失败', desc:'图片读取失败，请重试' });
        }
    });

    // ==================== 保存昵称 ====================
    mask.querySelector('#hhkan-pp-nick-save').addEventListener('click', ()=>{
        const input = mask.querySelector('#hhkan-pp-nick');
        const val = (input.value || '').trim();
        if(!val){
            return showProfileToast(mask, { icon:'⚠️', title:'昵称不能为空', desc:`不填的话会恢复默认「${HHKAN_PROFILE.defaultNick}」` });
        }
        if(val.length > 20){
            return showProfileToast(mask, { icon:'⚠️', title:'昵称太长', desc:'最多支持 20 个字符，请缩短一下' });
        }
        _setNick(val);
        applyProfileToPage();
        showProfileToast(mask, {
            icon:'✨', title:'昵称保存成功',
            desc:`「${val}」已同步到个人主页与头部`,
            colors:['#ffd93d','#ff9f43','#ff6b6b','#7f5cff','#5ad6ff','#6bcb77']
        });
    });

    // ==================== 头像库「刷新」====================
    // ★ 每个分类固定出 50 张（perPage=50），刷新换一批并弹「成功 + 撒花」提示
    const moreBtn = mask.querySelector('#hhkan-pp-ai-more');
    if(moreBtn){
        moreBtn.addEventListener('click', ()=>{
            _aiState.batch++;
            renderAiGrid(mask, 0);
            const catName = _aiState.cat ? _aiState.cat.name : '全部';
            showProfileToast(mask, {
                icon:'🎉', title:'头像已刷新',
                desc:`「${catName}」分类已换上第 ${_aiState.batch + 1} 批 ${HHKAN_PROFILE.perPage} 张新头像`,
                colors:['#7f5cff','#5ad6ff','#6bcb77','#ffd93d','#ff6fb5','#4d96ff']
            });
        });
    }
    // ==================== 背景库「换一批」====（随机壁纸 · 不重复 · 抽完才重置）====
    const bgMore = mask.querySelector('#hhkan-pp-bg-more');
    if(bgMore){
        bgMore.addEventListener('click', ()=>{
            renderBgGridPanel(mask);
            const cat = _ppBgState.cat || _ppBgAllCat();
            showProfileToast(mask, {
                icon:'🎉', title:'已换一批壁纸',
                desc:`「${cat.icon} ${cat.name}」已重新洗牌 ${HHKAN_PROFILE.perPage} 张，均无重复`,
                colors:['#7f5cff','#5ad6ff','#6bcb77','#ffd93d','#ff6fb5','#4d96ff']
            });
        });
    }

    // ==================== 随机昵称 ====================
    const randBtn = mask.querySelector('#hhkan-pp-nick-rand');
    if(randBtn){
        randBtn.addEventListener('click', ()=>{
            renderNickBatch(mask);   // ★ 优化三：一次生成 100 个候选
            // 进入动画：按钮抖动 + 图标旋转
            randBtn.classList.remove('hhkan-pp-rand-spin');
            void randBtn.offsetWidth;   // 触发重绘，让动画可重复播放
            randBtn.classList.add('hhkan-pp-rand-spin');
        });
    }
    const useBtn = mask.querySelector('#hhkan-pp-nick-use');
    if(useBtn){
        useBtn.addEventListener('click', ()=>{
            const name = _nickState.current || mask.querySelector('#hhkan-pp-nick-big').textContent;
            if(!name || name === '点击下方「🎲 生成 100 个」开始'){
                return showProfileToast(mask, { icon:'🎲', title:'先生成一批', desc:'请先点击「生成 100 个」生成候选昵称' });
            }
            // 写入输入框并保存
            const input = mask.querySelector('#hhkan-pp-nick');
            input.value = name;
            _setNick(name);
            applyProfileToPage();
            // 优化一：仅并入统一使用记录（不再单独存一份昵称历史）
            const catName = _nickState.cat ? _nickState.cat.name
                : (_nickState.mood ? _nickState.mood.name : '随机昵称');
            _pushNickHistory(name, catName);
            renderProfileHistoryPanel(mask);
            showProfileToast(mask, { icon:'🎉', title:'昵称已使用', desc:`「${name}」已成为你的新昵称，可在「使用记录」查看` });
        });
    }

    // ==================== 昵称字体颜色 / 渐变色（优化二）====================
    bindNickColorPanel(mask);

    // 关闭弹窗
    const toast = mask.querySelector('#hhkan-pp-toast');
    const closeToast = ()=>{
        if(!toast) return;
        toast.classList.add('hhkan-pp-toast-hide');
        setTimeout(()=>{ toast.hidden = true; toast.classList.remove('hhkan-pp-toast-hide'); }, 260);
    };
    mask.querySelector('#hhkan-pp-toast-btn')?.addEventListener('click', closeToast);
    toast?.addEventListener('click', (e)=>{ if(e.target === toast) closeToast(); });
}

// ==================== 注入面板到 info-swiper 第4个 child 右侧 ====================
function ensurePanelMounted(){
    if(!HHKAN_PROFILE.enabled) return;
    const sw4 = document.querySelector(PROFILE_SEL.swiper4);
    const mask = document.querySelector('#hhkan-profile-mask');
    if(!sw4 || mask) return;
    // 面板已 buildProfilePanel 时挂到 body 上，这里确保定位相对于 info-swiper 区域
    // 面板本身是 fixed 全屏遮罩 + 右侧抽屉，无需再插入到 swiper 内
}

// ==================== 初始化 ====================
function initProfile(){
    if(_profileInited) return;
    _profileInited = true;

    // CSS
    if(!document.querySelector('#hhkan-profile-style')){
        const style = document.createElement('style');
        style.id = 'hhkan-profile-style';
        style.textContent = `
          /* ★ 与下拉栏菜单项同款规格（对齐侧边栏按钮的 i 图标 + span 文字结构）：
               图标格 18px、字号 14px、行高 1.2、圆角 8px、padding 0 12px，
               图标与文字紧贴（gap:8px）左对齐；hover 改 #F5F5DC 米白底 + 近黑字。 */
          .hhkan-profile-entry{
            box-sizing:border-box!important;
            display:flex!important;flex-direction:row!important;
            align-items:center!important;justify-content:flex-start!important;
            gap:8px!important;flex:0 0 auto!important;
            height:38px!important;min-height:38px!important;max-height:38px!important;
            margin-left:8px!important;padding:0 12px!important;
            border:1px solid #1f2733!important;border-radius:8px!important;
            background-color:#000!important;background-image:none!important;
            /* 跟随主题色（与菜单 hover/active 同色） */
            color:var(--fs-accent-color,var(--pp-accent,#f5c518))!important;
            font-size:14px!important;line-height:1.2!important;font-weight:500!important;
            letter-spacing:.01em!important;
            text-decoration:none!important;text-align:center!important;
            cursor:pointer!important;white-space:nowrap!important;overflow:hidden!important;
            text-overflow:ellipsis!important;
            transition:background-color .2s ease,color .2s ease,border-color .2s ease,box-shadow .2s ease!important;
            outline:none!important;
          }
          /* hover：#F5F5DC 米白底 + 近黑字（★ 按需求指定色） */
          .hhkan-profile-entry:hover,
          .hhkan-profile-entry:focus{
            background-color:#F5F5DC!important;border-color:#F5F5DC!important;
            color:#0b1020!important;outline:none!important;
            box-shadow:0 2px 10px rgba(245,245,220,.28)!important;
          }
          /* 图标：与菜单项图标同款定宽格 + 同款线条字形 */
          .hhkan-profile-entry > i,
          .hhkan-profile-entry > .pp-entry-ic{
            display:inline-flex!important;align-items:center!important;justify-content:center!important;
            flex:0 0 auto!important;
            width:18px!important;height:18px!important;min-width:18px!important;
            margin:0!important;padding:0!important;
            font-style:normal!important;font-size:18px!important;line-height:1!important;
            color:inherit!important;background-color:transparent!important;border-radius:4px!important;
          }
          /* 文字：与菜单项文字同字号、垂直居中、图标紧贴 */
          .hhkan-profile-entry > span{
            display:inline-block!important;flex:0 0 auto!important;
            color:inherit!important;background-color:transparent!important;
            font-size:14px!important;font-weight:500!important;line-height:38px!important;
            text-align:center!important;white-space:nowrap!important;
          }
          /* 白天主题下保持同款米白 hover，仅默认底换白、描边换浅灰 */
          [data-pp-theme="light"] .hhkan-profile-entry{
            background-color:#fff!important;border-color:#e2e8f0!important;
            color:var(--fs-accent-color,#3b82f6)!important;
          }
          [data-pp-theme="light"] .hhkan-profile-entry:hover,
          [data-pp-theme="light"] .hhkan-profile-entry:focus{
            background-color:#F5F5DC!important;border-color:#F5F5DC!important;
            color:#0f172a!important;
          }
          /* 遮罩 + 右侧抽屉 */
          #hhkan-profile-mask{
            position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.45);
            opacity:0;pointer-events:none;transition:opacity .25s ease;
            display:flex;justify-content:flex-end;
          }
          #hhkan-profile-mask.hhkan-profile-open{opacity:1;pointer-events:auto;}
          .hhkan-profile-panel{
            width:420px;max-width:92vw;height:100%;background:#202026;color:#fff;
            box-shadow:-8px 0 40px rgba(0,0,0,.5);transform:translateX(100%);
            transition:transform .3s cubic-bezier(.22,1,.36,1);
            display:flex;flex-direction:column;overflow:hidden;
            font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
          }
          #hhkan-profile-mask.hhkan-profile-open .hhkan-profile-panel{transform:translateX(0);}
          .hhkan-pp-head{
            display:flex;align-items:center;justify-content:space-between;
            padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;
          }
          .hhkan-pp-head h3{margin:0;font-size:16px;font-weight:700;}
          .hhkan-pp-close{
            background:none;border:none;color:#aaa;font-size:18px;cursor:pointer;line-height:1;
          }
          .hhkan-pp-close:hover{color:#fff;}
          .hhkan-pp-body{flex:1;overflow-y:auto;padding:18px;}
          .hhkan-pp-body::-webkit-scrollbar{width:6px;}
          .hhkan-pp-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:3px;}
          /* 预览区 */
          /* ★ 优化一：头像框与背景框【等高】。两个 wrap 统一高度（取头像框高度 88px），
             内部预览块保持各自比例（头像 1:1 圆形 / 背景 16:9 宽幅），宽度等比自适应。 */
          .hhkan-pp-preview{align-items:flex-end;gap:14px;margin-bottom:20px;}
          .hhkan-pp-avatar-wrap,.hhkan-pp-bg-wrap{
            display:flex;flex-direction:column;align-items:center;gap:8px;
            height:112px;justify-content:flex-start;
          }
          .hhkan-pp-avatar{
            width:88px;height:88px;border-radius:50%;overflow:hidden;
            background:linear-gradient(135deg,#302b63,#24243e);
            display:flex;align-items:center;justify-content:center;border:3px solid #7f5cff;
          }
          .hhkan-pp-avatar img{width:100%;height:100%;object-fit:cover;}
          .hhkan-pp-avatar-emoji{font-size:40px;}
          /* ★ 优化一：背景框与头像框等高（112px），宽度按 16:9 等比计算 → 199px */
          .hhkan-pp-bg{
            width:calc(112px * 16 / 9);height:112px;border-radius:8px;overflow:hidden;
            background:#2a2a32;background-size:cover;background-position:center;
            display:flex;align-items:center;justify-content:center;border:2px solid #3a3a4a;
          }
          .hhkan-pp-bg-tip{font-size:11px;color:#777;}
          .hhkan-pp-upload-btn{
            display:inline-flex;align-items:center;gap:4px;font-size:11px;
            padding:5px 10px;border-radius:5px;background:#383840;color:#fff;
            cursor:pointer;transition:background .2s;
          }
          .hhkan-pp-upload-btn:hover{background:#4a4a55;}
          .hhkan-pp-upload-btn-sec{background:#2b3a55;}
          .hhkan-pp-upload-btn-sec:hover{background:#35486a;}
          /* 昵称 */
          .hhkan-pp-nick-row{
            display:flex;align-items:center;gap:8px;margin-bottom:20px;
            padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08);
          }
          .hhkan-pp-nick-row label{font-size:13px;color:#aaa;white-space:nowrap;}
          .hhkan-pp-nick-row input{
            flex:1;height:32px;border-radius:6px;border:1px solid #3a3a4a;
            background:#2a2a32;color:#fff;padding:0 10px;font-size:13px;outline:none;
          }
          .hhkan-pp-nick-row input:focus{border-color:#7f5cff;}
          .hhkan-pp-nick-row button{
            height:32px;padding:0 14px;border:none;border-radius:6px;cursor:pointer;
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);color:#fff;font-size:12px;font-weight:600;
          }
          /* AI 头像库 */
          .hhkan-pp-ai-head{margin-bottom:12px;}
          .hhkan-pp-ai-head > span{font-size:13px;color:#ccc;}
          .hhkan-pp-cats{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
          .hhkan-pp-cat{
            padding:5px 12px;border-radius:14px;border:1px solid #3a3a4a;background:#2a2a32;
            color:#ccc;font-size:12px;cursor:pointer;transition:all .2s;
          }
          .hhkan-pp-cat:hover{border-color:#7f5cff;color:#fff;}
          .hhkan-pp-cat-active{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);border-color:transparent;color:#fff;font-weight:600;
          }
          .hhkan-pp-ai-grid{
            display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px;
          }
          .hhkan-pp-ai-item{
            aspect-ratio:1/1;border-radius:8px;background:#2a2a32;background-size:cover;
            background-position:center;cursor:pointer;border:2px solid transparent;
            transition:transform .15s,border-color .15s;
          }
          .hhkan-pp-ai-item:hover{transform:scale(1.06);border-color:#5ad6ff;}
          .hhkan-pp-ai-item.hhkan-pp-ai-active{border-color:#7f5cff;box-shadow:0 0 0 2px rgba(127,92,255,.4);}
          .hhkan-pp-ai-more{display:flex;align-items:center;justify-content:center;gap:12px;}
          .hhkan-pp-ai-more button{
            padding:7px 20px;border:none;border-radius:6px;cursor:pointer;
            background:#383840;color:#fff;font-size:12px;
          }
          .hhkan-pp-ai-more button:hover{background:#4a4a55;}
          .hhkan-pp-ai-more button:disabled{opacity:.4;cursor:not-allowed;}
          .hhkan-pp-ai-more span{font-size:11px;color:#777;}

          /* ==================== 分区 Tabs ==================== */
          .hhkan-pp-tabs{
            display:flex;gap:6px;margin-bottom:16px;padding-bottom:12px;
            border-bottom:1px solid rgba(255,255,255,.08);
          }
          .hhkan-pp-tab{
            flex:1;height:34px;border:none;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:600;
            background:#2a2a32;color:#aaa;transition:all .2s;outline:none;
          }
          .hhkan-pp-tab:hover{color:#fff;background:#34343e;}
          .hhkan-pp-tab-active{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);color:#fff;
            box-shadow:0 4px 14px rgba(127,92,255,.35);
          }
          .hhkan-pp-tab-pane{animation:ppFadeIn .25s ease;}
          @keyframes ppFadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
          .hhkan-pp-tip-mini{display:block;margin-top:6px;font-size:11px;color:#777;}

          /* ==================== 背景图网格（横向宽幅）==================== */
          .hhkan-pp-bg-grid{grid-template-columns:repeat(3,1fr);}
          .hhkan-pp-bg-grid .hhkan-pp-ai-item{aspect-ratio:16/9;}

          /* ==================== 随机昵称 ==================== */
          .hhkan-pp-nick-result{
            background:linear-gradient(135deg,rgba(127,92,255,.14),rgba(90,214,255,.1));
            border:1px solid rgba(127,92,255,.25);border-radius:14px;
            padding:26px 18px;margin-bottom:16px;text-align:center;
          }
          .hhkan-pp-nick-big{
            font-size:30px;font-weight:900;letter-spacing:2px;min-height:1.4em;
            background:linear-gradient(135deg,#fff,#cbb6ff);
            -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
            text-shadow:0 2px 20px rgba(127,92,255,.25);
          }
          .hhkan-pp-nick-sub{font-size:12px;color:#9aa;margin-top:8px;min-height:1.4em;}
          .hhkan-pp-nick-actions{display:flex;gap:10px;margin-bottom:18px;}
          .hhkan-pp-nick-rand,.hhkan-pp-nick-use{
            flex:1;height:40px;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:700;
            transition:transform .12s,box-shadow .2s;
          }
          .hhkan-pp-nick-rand{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);color:#fff;
            box-shadow:0 4px 16px rgba(127,92,255,.3);
          }
          .hhkan-pp-nick-rand:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(127,92,255,.45);}
          .hhkan-pp-nick-rand:active{transform:scale(.97);}
          .hhkan-pp-nick-rand.hhkan-pp-rand-spin{animation:ppRandSpin .5s ease;}
          @keyframes ppRandSpin{0%{transform:rotate(0);}100%{transform:rotate(360deg);}}
          .hhkan-pp-nick-use{background:#2e2e38;color:#fff;}
          .hhkan-pp-nick-use:hover{background:#3a3a47;}
          .hhkan-pp-nick-history{margin-top:4px;}
          .hhkan-pp-nick-history-label{font-size:11px;color:#777;}
          .hhkan-pp-nick-history-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
          .hhkan-pp-nick-chip{
            padding:5px 12px;border-radius:14px;background:#2a2a32;border:1px solid #3a3a4a;
            font-size:12px;color:#ddd;cursor:pointer;transition:all .15s;
          }
          .hhkan-pp-nick-chip:hover{
            border-color:#7f5cff;color:#fff;background:rgba(127,92,255,.15);
            transform:translateY(-1px);
          }
          .hhkan-pp-nick-chip-active{
            border-color:#7f5cff;color:#fff;background:linear-gradient(135deg,rgba(127,92,255,.35),rgba(90,214,255,.25));
            box-shadow:0 0 10px rgba(127,92,255,.45);font-weight:700;
          }
          .hhkan-pp-nick-chip-empty{color:#777;cursor:default;}
          .hhkan-pp-nick-chip-empty:hover{transform:none;border-color:#3a3a4a;background:#2a2a32;color:#777;}
          /* ★ 优化三：100 个昵称候选网格 */
          .hhkan-pp-nick-grid{
            display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));
            gap:6px;max-height:236px;overflow-y:auto;padding:8px;
            background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);
            border-radius:12px;margin-bottom:16px;
          }
          .hhkan-pp-nick-grid::-webkit-scrollbar{width:6px;}
          .hhkan-pp-nick-grid::-webkit-scrollbar-thumb{background:rgba(127,92,255,.5);border-radius:3px;}

          /* ==================== 昵称 · 三维筛选器（优化二）==================== */
          .hhkan-pp-subcats{
            display:flex;flex-direction:column;gap:8px;margin-top:10px;
            padding-top:10px;border-top:1px dashed rgba(255,255,255,.12);
          }
          .hhkan-pp-subcat{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
          .hhkan-pp-subcat-label{
            font-size:11.5px;color:#9aa;font-weight:700;letter-spacing:1px;
            min-width:32px;flex-shrink:0;
          }
          .hhkan-pp-cats-mini{margin:0;flex:1;gap:5px;}
          .hhkan-pp-cats-mini .hhkan-pp-cat-mini{
            padding:4px 11px;font-size:11px;border-radius:12px;border:1px solid #3a3a4a;
            background:#26262e;color:#bbb;cursor:pointer;transition:all .15s;line-height:1.5;
          }
          .hhkan-pp-cats-mini .hhkan-pp-cat-mini:hover{
            border-color:#7f5cff;color:#fff;background:rgba(127,92,255,.15);
          }
          .hhkan-pp-cats-mini .hhkan-pp-cat-mini.hhkan-pp-cat-active{
            background:linear-gradient(135deg,rgba(127,92,255,.5),rgba(90,214,255,.35));
            border-color:transparent;color:#fff;font-weight:700;
            box-shadow:0 0 8px rgba(127,92,255,.4);
          }
          .hhkan-pp-subcats-line{display:none;}
          .hhkan-pp-nick-history-note{
            font-size:11px;color:#8a8a99;padding:8px 10px;margin-top:10px;
            background:rgba(127,92,255,.06);border-left:3px solid rgba(127,92,255,.5);
            border-radius:6px;line-height:1.6;
          }
          /* 白天模式下的筛选器配色 */
          html[data-pp-theme="light"] .hhkan-pp-subcats{border-top-color:rgba(0,0,0,.10);}
          html[data-pp-theme="light"] .hhkan-pp-subcat-label{color:#6b6b70;}
          html[data-pp-theme="light"] .hhkan-pp-cats-mini .hhkan-pp-cat-mini{
            background:#ffffff;border-color:rgba(0,0,0,.14);color:#3c3c43;
          }
          html[data-pp-theme="light"] .hhkan-pp-cats-mini .hhkan-pp-cat-mini:hover{
            border-color:#2563eb;color:#1c1c1e;background:rgba(37,99,235,.08);
          }
          html[data-pp-theme="light"] .hhkan-pp-cats-mini .hhkan-pp-cat-mini.hhkan-pp-cat-active{
            background:linear-gradient(135deg,#2563eb,#38bdf8);color:#fff;box-shadow:0 0 8px rgba(37,99,235,.3);
          }
          html[data-pp-theme="light"] .hhkan-pp-nick-history-note{
            color:#6b6b70;background:rgba(37,99,235,.05);border-left-color:#2563eb;
          }

          /* ==================== 背景图库 · 随机壁纸卡片（内嵌 · 不叠加不重复）==================== */
          /* 横向宽幅壁纸网格：3 列 16:9，契合手机 / 桌面宽屏预览 */
          .hhkan-pp-bg-grid{grid-template-columns:repeat(3,1fr);}
          .hhkan-pp-bg-grid .hhkan-pp-ai-item{aspect-ratio:16/9;}
          /* 壁纸卡片：占位底色 + 渐入 + 选中态 */
          .hhkan-pp-bg-wall{
            background-size:cover;background-position:center;background-repeat:no-repeat;
            position:relative;border-radius:10px;overflow:hidden;cursor:pointer;
            transition:transform .15s,border-color .15s,box-shadow .2s,opacity .35s;
            border:2px solid transparent;
          }
          /* 加载前用分类配色占位，加载完成后淡入真实图，避免白块闪烁 */
          .hhkan-pp-bg-wall.hhkan-pp-bg-loading{opacity:0;}
          .hhkan-pp-bg-wall:not(.hhkan-pp-bg-loading){opacity:1;}
          .hhkan-pp-bg-wall::after{
            content:'';position:absolute;inset:0;
            background:linear-gradient(to top,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 55%);
            pointer-events:none;opacity:0;transition:opacity .2s;
          }
          .hhkan-pp-bg-wall:hover{transform:translateY(-3px);box-shadow:0 10px 26px rgba(0,0,0,.45);}
          .hhkan-pp-bg-wall:hover::after{opacity:1;}
          .hhkan-pp-bg-wall.hhkan-pp-ai-active{
            border-color:#7f5cff;box-shadow:0 0 0 2px rgba(127,92,255,.35),0 8px 24px rgba(127,92,255,.45);
          }
          /* 底部说明条：解释「不叠加 / 不重复」机制 */
          .hhkan-pp-bg-note{
            margin-top:12px;padding:10px 14px;border-radius:10px;
            background:rgba(127,92,255,.07);border:1px dashed rgba(127,92,255,.28);
            font-size:11.5px;line-height:1.7;color:#9aa;text-align:left;
          }
          html[data-pp-theme="light"] .hhkan-pp-bg-note{
            background:rgba(37,99,235,.05);border-color:rgba(37,99,235,.22);color:#6b6b70;
          }
          /* 白天模式：壁纸卡片选中色与白底协调 */
          html[data-pp-theme="light"] .hhkan-pp-bg-wall.hhkan-pp-ai-active{
            border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.25),0 8px 24px rgba(37,99,235,.28);
          }

                    /* ==================== 昵称字体颜色 / 渐变色（优化二）==================== */
          .hhkan-pp-nick-color{
            background:linear-gradient(135deg,rgba(127,92,255,.10),rgba(90,214,255,.06));
            border:1px solid rgba(127,92,255,.20);border-radius:14px;
            padding:14px 16px;margin-bottom:16px;
          }
          .hhkan-pp-nick-color-head{
            display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;
          }
          .hhkan-pp-nick-color-title{font-size:13px;font-weight:800;color:#fff;letter-spacing:.5px;}
          .hhkan-pp-nick-color-preview{
            font-size:16px;font-weight:900;letter-spacing:1px;padding:4px 12px;
            background:linear-gradient(135deg,#fff,#cbb6ff);-webkit-background-clip:text;background-clip:text;
            -webkit-text-fill-color:transparent;color:transparent;
            border:1px dashed rgba(127,92,255,.35);border-radius:8px;max-width:45%;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap;
          }
          .hhkan-pp-nick-color-modes{display:flex;gap:8px;margin-bottom:12px;}
          .hhkan-pp-nc-mode{
            flex:1;height:32px;border:1px solid #3a3a4a;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:700;
            background:#2a2a32;color:#ccc;transition:all .2s;outline:none;
          }
          .hhkan-pp-nc-mode:hover{color:#fff;border-color:#7f5cff;}
          .hhkan-pp-nc-mode-active{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);border-color:transparent;color:#fff;
            box-shadow:0 3px 12px rgba(127,92,255,.35);
          }
          .hhkan-pp-nick-color-body{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;}
          .hhkan-pp-nc-field{
            display:flex;flex-direction:column;gap:5px;align-items:flex-start;
            flex:1;min-width:90px;
          }
          .hhkan-pp-nc-field > span{
            font-size:11px;color:#9aa;font-weight:600;letter-spacing:.5px;
          }
          .hhkan-pp-nc-field > span b{color:#cbb6ff;font-weight:700;}
          .hhkan-pp-nc-field input[type="color"]{
            width:100%;height:34px;border:1px solid #3a3a4a;border-radius:7px;cursor:pointer;padding:2px;
            background:#2a2a32;outline:none;
          }
          .hhkan-pp-nc-field input[type="range"]{
            width:100%;height:6px;border-radius:3px;-webkit-appearance:none;appearance:none;
            background:linear-gradient(90deg,#7f5cff,#5ad6ff);outline:none;margin-top:8px;
          }
          .hhkan-pp-nc-field input[type="range"]::-webkit-slider-thumb{
            -webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;
            background:#fff;border:2px solid #7f5cff;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);
          }
          .hhkan-pp-nc-field input[type="range"]::-moz-range-thumb{
            width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #7f5cff;cursor:pointer;
          }
          .hhkan-pp-nick-color-actions{
            display:flex;gap:6px;flex-wrap:wrap;align-items:center;
          }
          .hhkan-pp-nick-color-swatch{
            width:26px;height:26px;border-radius:50%;cursor:pointer;border:2px solid rgba(255,255,255,.18);
            transition:transform .12s,border-color .15s,box-shadow .2s;outline:none;padding:0;
          }
          .hhkan-pp-nick-color-swatch[data-color="#ffffff"]{background:#ffffff;}
          .hhkan-pp-nick-color-swatch[data-color="#f5c518"]{background:#f5c518;}
          .hhkan-pp-nick-color-swatch[data-color="#7f5cff"]{background:#7f5cff;}
          .hhkan-pp-nick-color-swatch[data-color="#5ad6ff"]{background:#5ad6ff;}
          .hhkan-pp-nick-color-swatch[data-color="#6bcb77"]{background:#6bcb77;}
          .hhkan-pp-nick-color-swatch[data-color="#ff6fb5"]{background:#ff6fb5;}
          .hhkan-pp-nick-color-swatch[data-color="#ff9f43"]{background:#ff9f43;}
          .hhkan-pp-nick-color-swatch[data-color="#ff6b6b"]{background:#ff6b6b;}
          .hhkan-pp-nick-color-swatch:hover{
            transform:scale(1.18);border-color:#fff;box-shadow:0 0 8px rgba(255,255,255,.4);
          }
          .hhkan-pp-nick-color-random{
            height:26px;padding:0 10px;border:1px solid #3a3a4a;border-radius:13px;cursor:pointer;font-size:11px;font-weight:700;
            background:linear-gradient(135deg,rgba(127,92,255,.4),rgba(90,214,255,.25));color:#fff;transition:all .2s;outline:none;
          }
          .hhkan-pp-nick-color-random:hover{border-color:#7f5cff;transform:scale(1.05);}
          .hhkan-pp-nick-color-reset{
            height:26px;padding:0 12px;border:1px solid #4a4a55;border-radius:13px;cursor:pointer;font-size:11px;font-weight:700;
            background:#2a2a32;color:#bbb;transition:all .2s;outline:none;
          }
          .hhkan-pp-nick-color-reset:hover{color:#fff;border-color:#7f5cff;background:rgba(127,92,255,.15);}
          /* 白天模式 */
          html[data-pp-theme="light"] .hhkan-pp-nick-color{
            background:linear-gradient(135deg,rgba(37,99,235,.07),rgba(56,189,248,.04));
            border-color:rgba(37,99,235,.18);
          }
          html[data-pp-theme="light"] .hhkan-pp-nick-color-title{color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-nick-color-preview{
            background:linear-gradient(135deg,#2563eb,#38bdf8);-webkit-background-clip:text;background-clip:text;
            -webkit-text-fill-color:transparent;color:transparent;border-color:rgba(37,99,235,.25);
          }
          html[data-pp-theme="light"] .hhkan-pp-nc-mode{
            background:#ffffff;border-color:rgba(0,0,0,.14);color:#3c3c43;
          }
          html[data-pp-theme="light"] .hhkan-pp-nc-mode:hover{color:#1c1c1e;border-color:#2563eb;}
          html[data-pp-theme="light"] .hhkan-pp-nc-mode-active{
            background:linear-gradient(135deg,#2563eb,#38bdf8);color:#fff;border-color:transparent;
            box-shadow:0 3px 12px rgba(37,99,235,.28);
          }
          html[data-pp-theme="light"] .hhkan-pp-nc-field > span{color:#6b6b70;}
          html[data-pp-theme="light"] .hhkan-pp-nc-field > span b{color:#2563eb;}
          html[data-pp-theme="light"] .hhkan-pp-nick-color-swatch{border-color:rgba(0,0,0,.16);}
          html[data-pp-theme="light"] .hhkan-pp-nick-color-reset{
            background:#ffffff;border-color:rgba(0,0,0,.14);color:#3c3c43;
          }
          html[data-pp-theme="light"] .hhkan-pp-nick-color-reset:hover{
            color:#fff;border-color:#2563eb;background:linear-gradient(135deg,#2563eb,#38bdf8);
          }

          /* ==================== 使用记录（历史记录）· 抽屉版 ==================== */
          /* ★ 优化四：昵称类型历史记录卡片（文字型，区别于图片缩略图） */
          .hhkan-pp-history-card-nick{border-color:rgba(255,214,0,.28);background:rgba(255,214,0,.06);}
          .hhkan-pp-history-img-nick{
            background:linear-gradient(135deg,#3a2f00,#2a2a32);
            display:flex;align-items:center;justify-content:center;font-size:24px;line-height:1;
          }
          .hhkan-pp-history-nick-icon{filter:drop-shadow(0 1px 4px rgba(255,214,0,.5));}
          .hhkan-pp-history-tag-nick{background:linear-gradient(135deg,#ffd93d,#ff9f43);}
          .hhkan-pp-history-nick-name{
            font-size:15px;font-weight:800;color:#fff;letter-spacing:1px;
            background:linear-gradient(135deg,#fff,#ffd93d);-webkit-background-clip:text;
            background-clip:text;-webkit-text-fill-color:transparent;
          }
          .hhkan-pp-history-toolbar{
            display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;
          }
          .hhkan-pp-history-filter{display:flex;flex-wrap:wrap;gap:6px;}
          .hhkan-pp-hfilter{
            padding:5px 14px;border-radius:14px;border:1px solid #3a3a4a;background:#2a2a32;
            color:#ccc;font-size:12px;cursor:pointer;transition:all .2s;
          }
          .hhkan-pp-hfilter:hover{border-color:#7f5cff;color:#fff;}
          .hhkan-pp-hfilter-active{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);border-color:transparent;color:#fff;font-weight:600;
          }
          .hhkan-pp-history-clear{
            padding:6px 14px;border-radius:14px;border:1px solid #4a3a3a;background:#3a2a2a;
            color:#ffb3b3;font-size:12px;cursor:pointer;transition:all .2s;
          }
          .hhkan-pp-history-clear:hover{background:#5a2a2a;color:#fff;border-color:#ff6b6b;}
          .hhkan-pp-history-stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}
          .hhkan-pp-hs-item{
            padding:5px 12px;border-radius:14px;background:rgba(127,92,255,.12);
            border:1px solid rgba(127,92,255,.25);font-size:11.5px;color:#cbb6ff;
          }
          .hhkan-pp-hs-item b{color:#fff;font-weight:800;}
          .hhkan-pp-history-empty{
            text-align:center;padding:46px 16px;background:rgba(255,255,255,.03);
            border:1px dashed rgba(255,255,255,.14);border-radius:16px;margin-bottom:14px;
          }
          .hhkan-pp-history-empty-icon{font-size:44px;line-height:1;margin-bottom:12px;opacity:.7;}
          .hhkan-pp-history-empty-text{font-size:14px;color:#ccc;font-weight:600;margin-bottom:8px;}
          .hhkan-pp-history-empty-sub{font-size:12px;color:#888;line-height:1.6;}
          .hhkan-pp-history-card{
            position:relative;border-radius:12px;overflow:hidden;background:#2a2a32;
            border:1px solid rgba(255,255,255,.08);cursor:pointer;
            transition:transform .15s,border-color .15s,box-shadow .2s;
            animation:ppFadeIn .25s ease;
          }
          .hhkan-pp-history-card:hover{
            transform:translateY(-3px);border-color:#7f5cff;
            box-shadow:0 8px 24px rgba(127,92,255,.3);
          }
          .hhkan-pp-history-img{width:100%;aspect-ratio:1/1;background-size:cover;background-position:center;background-color:#222;}
          .hhkan-pp-history-tag{
            position:absolute;top:8px;left:8px;padding:3px 9px;border-radius:12px;
            font-size:10.5px;font-weight:700;color:#fff;backdrop-filter:blur(4px);
            -webkit-backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,.3);
          }
          .hhkan-pp-history-tag-avatar{background:rgba(127,92,255,.85);}
          .hhkan-pp-history-tag-bg{background:rgba(255,122,89,.85);}
          .hhkan-pp-history-meta{padding:9px 10px 10px;}
          .hhkan-pp-history-name{
            font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;
            text-overflow:ellipsis;margin-bottom:6px;
          }
          /* ★ 优化二：黑夜模式次级文字提亮，保证在深色卡片上清晰可读 */
          .hhkan-pp-history-cat{font-size:10.5px;color:#c8c8d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          .hhkan-pp-history-time{font-size:10.5px;color:#a8a8b6;margin-top:4px;}
          .hhkan-pp-history-del{
            position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;
            border:none;background:rgba(0,0,0,.55);color:#fff;font-size:11px;line-height:1;
            cursor:pointer;display:none;align-items:center;justify-content:center;
            transition:background .15s,transform .12s;
          }
          .hhkan-pp-history-card:hover .hhkan-pp-history-del{display:flex;}
          .hhkan-pp-history-del:hover{background:#ff4d4d;transform:scale(1.12);}
          /* 抽屉版记录网格：头像 1:1、背景 16:9 交错？此处统一 1:1，背景记录更清晰 */
          .hhkan-pp-tab-pane[data-pane="history"] .hhkan-pp-history-img{aspect-ratio:1/1;}
          .hhkan-pp-tab-pane[data-pane="history"] .hhkan-pp-ai-grid{grid-template-columns:repeat(4,1fr);}

          /* ==================== 使用记录 · 双主题配色（优化三）====================
             ★ 黑夜（默认）卡片近黑底 + 暖白字 + 蓝灰次级信息；
             ★ 白天（[data-pp-theme="light"]）卡片白底 + 近黑字 + 中灰次级信息；
             其余配色变量集中在此，避免黑夜白字叠白底 / 白天黑字叠黑底看不清。 */
          html[data-pp-theme="light"] .hhkan-pp-history-card{
            background:#ffffff;border-color:rgba(0,0,0,.09);box-shadow:0 2px 10px rgba(0,0,0,.06);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-card:hover{
            border-color:#2563eb;box-shadow:0 8px 24px rgba(37,99,235,.18);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-name{
            color:#1c1c1e;   /* 近黑，白天清晰可读 */
          }
          html[data-pp-theme="light"] .hhkan-pp-history-cat{
            color:#4a4a55;   /* ★ 优化二：白天次级分类信息清晰可读 */
          }
          html[data-pp-theme="light"] .hhkan-pp-history-time{
            color:#5a5a63;   /* ★ 优化二：白天时间戳提亮，不偏淡 */
          }
          html[data-pp-theme="light"] .hhkan-pp-history-card-nick{
            border-color:rgba(214,158,0,.35);background:rgba(255,214,0,.10);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-img-nick{
            background:linear-gradient(135deg,#fff8e1,#f1f3f5);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-nick-name{
            color:#7a5c00;   /* 深金棕，白天不刺眼但清晰 */
            background:none;-webkit-text-fill-color:#7a5c00;background-clip:border-box;
          }
          html[data-pp-theme="light"] .hhkan-pp-history-empty{
            background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.12);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-empty-text{color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-history-empty-sub{color:#6b6b70;}
          html[data-pp-theme="light"] .hhkan-pp-history-img{
            background-color:#f1f3f5;border-color:rgba(0,0,0,.06);
          }
          html[data-pp-theme="light"] .hhkan-pp-hs-item{
            background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.22);color:#2563eb;
          }
          html[data-pp-theme="light"] .hhkan-pp-hs-item b{color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-hfilter{
            background:#ffffff;border-color:rgba(0,0,0,.14);color:#3c3c43;
          }
          html[data-pp-theme="light"] .hhkan-pp-hfilter:hover{border-color:#2563eb;color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-hfilter-active{
            background:linear-gradient(135deg,#2563eb,#38bdf8);color:#fff;
          }
          html[data-pp-theme="light"] .hhkan-pp-history-clear{
            background:#fff;border-color:rgba(220,38,38,.3);color:#dc2626;
          }
          html[data-pp-theme="light"] .hhkan-pp-history-clear:hover{background:#fef2f2;color:#b91c1c;}

          /* ==================== 精美结果弹窗 ==================== */
          .hhkan-pp-toast-mask{
            position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.6);
            display:flex;align-items:center;justify-content:center;
            backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
            animation:ppToastMaskIn .22s ease;
          }
          .hhkan-pp-toast-mask[hidden]{display:none;}
          .hhkan-pp-toast-mask.hhkan-pp-toast-hide{opacity:0;transition:opacity .25s ease;}
          @keyframes ppToastMaskIn{from{opacity:0;}to{opacity:1;}}
          .hhkan-pp-toast{
            position:relative;
            width:300px;padding:30px 24px 22px;border-radius:22px;text-align:center;overflow:hidden;
            background:linear-gradient(160deg,#2d2d3b,#1d1d25);
            box-shadow:0 24px 64px rgba(0,0,0,.62),0 0 0 1px rgba(255,255,255,.08),0 0 60px rgba(127,92,255,.18);
            animation:ppToastPop .36s cubic-bezier(.22,1.36,1);
          }
          /* 面板顶部高光条 */
          .hhkan-pp-toast::before{
            content:"";position:absolute;left:50%;top:0;transform:translateX(-50%);
            width:62%;height:3px;border-radius:0 0 4px 4px;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);
          }
          /* 面板底部渐变光晕装饰 */
          .hhkan-pp-toast::after{
            content:"";position:absolute;left:50%;bottom:-30px;transform:translateX(-50%);
            width:80%;height:60px;border-radius:50%;
            background:radial-gradient(ellipse,rgba(127,92,255,.2) 0%,transparent 70%);
            pointer-events:none;z-index:0;
          }
          @keyframes ppToastPop{
            0%{opacity:0;transform:scale(.66) translateY(14px);}
            60%{transform:scale(1.04) translateY(-2px);}
            100%{opacity:1;transform:scale(1) translateY(0);}
          }
          /* 成功光环：从图标处向外扩散 */
          .hhkan-pp-toast-ring{
            position:absolute;left:50%;top:42px;width:90px;height:90px;border-radius:50%;
            transform:translate(-50%,-50%) scale(.4);opacity:0;pointer-events:none;
            border:3px solid rgba(127,92,255,.7);box-sizing:border-box;
            animation:ppToastRing .85s .05s cubic-bezier(.22,.7,.35,1) forwards;
          }
          @keyframes ppToastRing{
            0%{transform:translate(-50%,-50%) scale(.4);opacity:.85;}
            100%{transform:translate(-50%,-50%) scale(2.6);opacity:0;}
          }
          /* 第二层光环：延迟扩散，形成双层涟漪 */
          .hhkan-pp-toast-ring2{
            position:absolute;left:50%;top:42px;width:90px;height:90px;border-radius:50%;
            transform:translate(-50%,-50%) scale(.4);opacity:0;pointer-events:none;
            border:2px solid rgba(90,214,255,.5);box-sizing:border-box;
            animation:ppToastRing2 1.1s .18s cubic-bezier(.22,.7,.35,1) forwards;
          }
          @keyframes ppToastRing2{
            0%{transform:translate(-50%,-50%) scale(.4);opacity:.6;}
            100%{transform:translate(-50%,-50%) scale(3.2);opacity:0;}
          }
          /* 中心闪光：成功瞬间爆一下 */
          .hhkan-pp-toast-burst{
            position:absolute;left:50%;top:42px;width:56px;height:56px;border-radius:50%;
            transform:translate(-50%,-50%) scale(0);opacity:0;pointer-events:none;
            background:radial-gradient(circle,rgba(255,255,255,.95) 0%,rgba(127,92,255,.55) 45%,transparent 70%);
            animation:ppToastBurst .55s .03s ease-out forwards;
          }
          @keyframes ppToastBurst{
            0%{transform:translate(-50%,-50%) scale(0);opacity:1;}
            60%{opacity:.55;}
            100%{transform:translate(-50%,-50%) scale(2.6);opacity:0;}
          }
          .hhkan-pp-toast-icon{
            position:relative;z-index:2;
            font-size:52px;line-height:1;margin-bottom:14px;
            display:inline-block;
            animation:ppToastIcon .58s cubic-bezier(.22,1.4,.36,1);
            filter:drop-shadow(0 4px 16px rgba(127,92,255,.55));
          }
          @keyframes ppToastIcon{
            0%{opacity:0;transform:scale(0) rotate(-36deg);}
            60%{transform:scale(1.22) rotate(6deg);}
            100%{opacity:1;transform:scale(1) rotate(0);}
          }
          .hhkan-pp-toast-title{
            position:relative;z-index:2;
            font-size:18px;font-weight:800;color:#fff;margin-bottom:7px;
            animation:ppToastTitle .4s .12s both cubic-bezier(.22,1.2,.4,1);
          }
          @keyframes ppToastTitle{
            from{opacity:0;transform:translateY(6px);}
            to{opacity:1;transform:none;}
          }
          .hhkan-pp-toast-desc{
            position:relative;z-index:2;
            font-size:12.5px;color:#b6b6c4;line-height:1.55;min-height:2.6em;
            animation:ppToastTitle .4s .2s both cubic-bezier(.22,1.2,.4,1);
          }
          .hhkan-pp-toast-preview{
            position:relative;z-index:2;
            width:90px;height:90px;margin:14px auto 0;border-radius:16px;
            background-size:cover;background-position:center;
            border:3px solid rgba(255,255,255,.2);
            box-shadow:0 6px 20px rgba(0,0,0,.42),0 0 22px rgba(127,92,255,.25);
            animation:ppToastPreview .4s .16s cubic-bezier(.22,1.36,1) both;
          }
          @keyframes ppToastPreview{
            0%{opacity:0;transform:scale(.6) rotate(-6deg);}
            100%{opacity:1;transform:scale(1) rotate(0);}
          }
          .hhkan-pp-toast-preview[hidden]{display:none;}
          /* 彩色碎片粒子：由 JS 动态生成，沿 --tx/--ty 方向飞散 */
          .hhkan-pp-toast-confetti{
            position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;
          }
          .hhkan-pp-toast-confetti>span{
            position:absolute;display:block;border-radius:2px;opacity:0;
            transform:translate(-50%,-50%) scale(1);
          }
          @keyframes hhkanPpConfetti{
            0%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(0deg);}
            100%{opacity:0;transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(.4) rotate(220deg);}
          }
          .hhkan-pp-toast-btn{
            position:relative;z-index:2;
            margin-top:20px;width:100%;height:42px;border:none;border-radius:10px;cursor:pointer;
            font-size:13px;font-weight:700;color:#fff;letter-spacing:1px;
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);
            box-shadow:0 5px 16px rgba(127,92,255,.38);
            transition:transform .12s,box-shadow .2s;
            animation:ppToastTitle .4s .24s both cubic-bezier(.22,1.2,.4,1);
          }
          .hhkan-pp-toast-btn:hover{transform:translateY(-1px);box-shadow:0 7px 22px rgba(127,92,255,.52);}
          .hhkan-pp-toast-btn:active{transform:scale(.97);}
          /* 主题色：警告 / 失败 */
          .hhkan-pp-toast-mask[data-tone="warn"] .hhkan-pp-toast-btn{background:linear-gradient(135deg,#f5a623,#f7d154);box-shadow:0 4px 14px rgba(245,166,35,.35);}
          .hhkan-pp-toast-mask[data-tone="bad"]  .hhkan-pp-toast-btn{background:linear-gradient(135deg,#ff6b6b,#ff8e8e);box-shadow:0 4px 14px rgba(255,107,107,.35);}
          .hhkan-pp-toast-mask[data-tone="warn"] .hhkan-pp-toast-icon{filter:drop-shadow(0 4px 14px rgba(245,166,35,.5));}
          .hhkan-pp-toast-mask[data-tone="bad"]  .hhkan-pp-toast-icon{filter:drop-shadow(0 4px 14px rgba(255,107,107,.5));}

          /* ==================== 背景图「选中确认」弹窗（优化二）==================== */
          /* 复用 toast 视觉体系：遮罩 + 卡片 + 光环 + 预览大图 + 双按钮 */
          .hhkan-pp-bg-confirm{
            position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.6);
            display:flex;align-items:center;justify-content:center;
            backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
            animation:ppToastMaskIn .22s ease;
          }
          .hhkan-pp-bg-confirm-box{
            position:relative;
            width:300px;padding:28px 22px 20px;border-radius:22px;text-align:center;overflow:hidden;
            background:linear-gradient(160deg,#2d2d3b,#1d1d25);
            box-shadow:0 24px 64px rgba(0,0,0,.62),0 0 0 1px rgba(255,255,255,.08),0 0 60px rgba(127,92,255,.18);
            animation:ppToastPop .36s cubic-bezier(.22,1.36,1);
          }
          .hhkan-pp-bg-confirm-box::before{
            content:"";position:absolute;left:50%;top:0;transform:translateX(-50%);
            width:62%;height:3px;border-radius:0 0 4px 4px;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);
          }
          .hhkan-pp-bg-confirm-box::after{
            content:"";position:absolute;left:50%;bottom:-30px;transform:translateX(-50%);
            width:80%;height:60px;border-radius:50%;
            background:radial-gradient(ellipse,rgba(127,92,255,.2) 0%,transparent 70%);
            pointer-events:none;z-index:0;
          }
          .hhkan-pp-bg-confirm-ring,.hhkan-pp-bg-confirm-ring2{
            position:absolute;left:50%;top:40px;width:84px;height:84px;border-radius:50%;
            transform:translate(-50%,-50%) scale(.4);opacity:0;pointer-events:none;box-sizing:border-box;
          }
          .hhkan-pp-bg-confirm-ring{
            border:3px solid rgba(127,92,255,.7);
            animation:ppToastRing .85s .05s cubic-bezier(.22,.7,.35,1) forwards;
          }
          .hhkan-pp-bg-confirm-ring2{
            border:2px solid rgba(90,214,255,.5);width:84px;height:84px;
            animation:ppToastRing2 1.1s .18s cubic-bezier(.22,.7,.35,1) forwards;
          }
          .hhkan-pp-bg-confirm-burst{
            position:absolute;left:50%;top:40px;width:52px;height:52px;border-radius:50%;
            transform:translate(-50%,-50%) scale(0);opacity:0;pointer-events:none;
            background:radial-gradient(circle,rgba(255,255,255,.95) 0%,rgba(127,92,255,.55) 45%,transparent 70%);
            animation:ppToastBurst .55s .03s ease-out forwards;
          }
          .hhkan-pp-bg-confirm-icon{
            position:relative;z-index:2;
            font-size:46px;line-height:1;margin-bottom:12px;display:inline-block;
            animation:ppToastIcon .58s cubic-bezier(.22,1.4,.36,1);
            filter:drop-shadow(0 4px 16px rgba(127,92,255,.55));
          }
          .hhkan-pp-bg-confirm-title{
            position:relative;z-index:2;
            font-size:17px;font-weight:800;color:#fff;margin-bottom:14px;
            animation:ppToastTitle .4s .12s both cubic-bezier(.22,1.2,.4,1);
          }
          /* 预览大图：展示选中的壁纸，16:9 宽幅 */
          .hhkan-pp-bg-confirm-preview{
            position:relative;z-index:2;
            width:100%;height:auto;aspect-ratio:16/9;margin:0 auto 14px;border-radius:14px;
            background-size:cover;background-position:center;background-color:#222;
            border:3px solid rgba(255,255,255,.2);
            box-shadow:0 8px 26px rgba(0,0,0,.45),0 0 24px rgba(127,92,255,.28);
            animation:ppToastPreview .4s .16s cubic-bezier(.22,1.36,1) both;
          }
          .hhkan-pp-bg-confirm-desc{
            position:relative;z-index:2;
            font-size:12px;color:#b6b6c4;line-height:1.6;margin-bottom:18px;padding:0 4px;
            animation:ppToastTitle .4s .2s both cubic-bezier(.22,1.2,.4,1);
          }
          .hhkan-pp-bg-confirm-actions{
            position:relative;z-index:2;
            display:flex;gap:10px;animation:ppToastTitle .4s .24s both cubic-bezier(.22,1.2,.4,1);
          }
          .hhkan-pp-bg-confirm-actions button{
            flex:1;height:40px;border:none;border-radius:10px;cursor:pointer;
            font-size:12.5px;font-weight:700;letter-spacing:.5px;
            transition:transform .12s,box-shadow .2s,background .2s;
          }
          .hhkan-pp-bg-confirm-cancel{
            background:rgba(255,255,255,.1);color:#d0d0d8;border:1px solid rgba(255,255,255,.16);
          }
          .hhkan-pp-bg-confirm-cancel:hover{background:rgba(255,255,255,.18);color:#fff;}
          .hhkan-pp-bg-confirm-ok{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);color:#fff;
            box-shadow:0 5px 16px rgba(127,92,255,.38);
          }
          .hhkan-pp-bg-confirm-ok:hover{transform:translateY(-1px);box-shadow:0 7px 22px rgba(127,92,255,.52);}
          .hhkan-pp-bg-confirm-ok:active,.hhkan-pp-bg-confirm-cancel:active{transform:scale(.97);}
          .hhkan-pp-bg-confirm-hide{opacity:0;transition:opacity .24s ease;}

          /* ==================== 内嵌「修改资料」选择夹 + 面板 ==================== */
          /* 追加到 user-container-header 的 tab 按钮：与页面原有选择夹同款样式 */
          .hhkan-uc-tab{
            display:inline-flex;align-items:center;gap:6px;padding:8px 16px;margin-right:4px;
            font-size:14px;line-height:1.2;color:inherit;cursor:pointer;border-radius:8px;
            transition:background .2s,color .2s,box-shadow .2s;user-select:none;
          }
          .hhkan-uc-tab:hover{background:rgba(127,92,255,.12);}
          .hhkan-uc-tab-active{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);color:#fff !important;
            box-shadow:0 4px 14px rgba(127,92,255,.35);font-weight:700;
          }
          /* 内嵌编辑面板：铺满 main 区，适配页面容器宽度 */
          .hhkan-uc-edit{
            width:100%;height:100%;min-height:100%;padding:8px 4px 40px;box-sizing:border-box;
            animation:ppFadeIn .25s ease;
          }
          .hhkan-uc-edit-inner{max-width:100%;}
          .hhkan-uc-head{margin-bottom:18px;}
          .hhkan-uc-head h3{margin:0 0 6px;font-size:18px;font-weight:800;letter-spacing:.5px;}
          .hhkan-uc-sub{font-size:12px;color:#8a8a98;}
          /* 宽屏下预览区横向铺开 */
          /* ★ 优化一：内嵌面板同样等高。头像框 104px，背景框与其等高、宽度按 16:9 等比 → 185px */
          .hhkan-uc-edit .hhkan-pp-preview{
            display:flex;flex-wrap:wrap;gap:28px;align-items:flex-end;margin-bottom:24px;
          }
          .hhkan-uc-edit .hhkan-pp-avatar-wrap,.hhkan-uc-edit .hhkan-pp-bg-wrap{height:132px;}
          .hhkan-uc-edit .hhkan-pp-avatar{width:104px;height:104px;}
          .hhkan-uc-edit .hhkan-pp-bg{width:calc(132px * 16 / 9);height:132px;}
          /* 网格列数随容器变宽而增多 */
          .hhkan-uc-edit .hhkan-pp-ai-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr));}
          .hhkan-uc-edit .hhkan-pp-bg-grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));}
          .hhkan-uc-edit .hhkan-pp-ai-grid .hhkan-pp-ai-item{aspect-ratio:1/1;}
          /* 昵称行在宽屏下加宽 */
          .hhkan-uc-edit .hhkan-pp-nick-row input{min-width:220px;}

          /* ==================== 使用记录（历史记录）==================== */
          .hhkan-pp-history-toolbar{
            display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;
          }
          .hhkan-pp-history-filter{display:flex;flex-wrap:wrap;gap:6px;}
          .hhkan-pp-hfilter{
            padding:5px 14px;border-radius:14px;border:1px solid #3a3a4a;background:#2a2a32;
            color:#ccc;font-size:12px;cursor:pointer;transition:all .2s;
          }
          .hhkan-pp-hfilter:hover{border-color:#7f5cff;color:#fff;}
          .hhkan-pp-hfilter-active{
            background:linear-gradient(135deg,#7f5cff,#5ad6ff);border-color:transparent;color:#fff;font-weight:600;
          }
          .hhkan-pp-history-clear{
            padding:6px 14px;border-radius:14px;border:1px solid #4a3a3a;background:#3a2a2a;
            color:#ffb3b3;font-size:12px;cursor:pointer;transition:all .2s;
          }
          .hhkan-pp-history-clear:hover{background:#5a2a2a;color:#fff;border-color:#ff6b6b;}
          .hhkan-pp-history-stats{
            display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;
          }
          .hhkan-pp-hs-item{
            padding:5px 12px;border-radius:14px;background:rgba(127,92,255,.12);
            border:1px solid rgba(127,92,255,.25);font-size:11.5px;color:#cbb6ff;
          }
          .hhkan-pp-hs-item b{color:#fff;font-weight:800;}
          .hhkan-pp-history-empty{
            text-align:center;padding:46px 16px;background:rgba(255,255,255,.03);
            border:1px dashed rgba(255,255,255,.14);border-radius:16px;margin-bottom:14px;
          }
          .hhkan-pp-history-empty-icon{font-size:44px;line-height:1;margin-bottom:12px;opacity:.7;}
          .hhkan-pp-history-empty-text{font-size:14px;color:#ccc;font-weight:600;margin-bottom:8px;}
          .hhkan-pp-history-empty-sub{font-size:12px;color:#888;line-height:1.6;}
          /* 记录卡片：与图库网格共用 .hhkan-pp-ai-grid，但卡片纵向布局 */
          .hhkan-pp-history-card{
            position:relative;border-radius:12px;overflow:hidden;background:#2a2a32;
            border:1px solid rgba(255,255,255,.08);cursor:pointer;
            transition:transform .15s,border-color .15s,box-shadow .2s;
            animation:ppFadeIn .25s ease;
          }
          .hhkan-pp-history-card:hover{
            transform:translateY(-3px);border-color:#7f5cff;
            box-shadow:0 8px 24px rgba(127,92,255,.3);
          }
          .hhkan-pp-history-img{
            width:100%;aspect-ratio:1/1;background-size:cover;background-position:center;
            background-color:#222;
          }
          .hhkan-pp-history-card .hhkan-pp-history-img[style*="aspect-ratio"]{ /* 保持 */ }
          .hhkan-pp-history-tag{
            position:absolute;top:8px;left:8px;padding:3px 9px;border-radius:12px;
            font-size:10.5px;font-weight:700;color:#fff;backdrop-filter:blur(4px);
            -webkit-backdrop-filter:blur(4px);box-shadow:0 2px 8px rgba(0,0,0,.3);
          }
          .hhkan-pp-history-tag-avatar{background:rgba(127,92,255,.85);}
          .hhkan-pp-history-tag-bg{background:rgba(255,122,89,.85);}
          .hhkan-pp-history-meta{padding:9px 10px 10px;}
          .hhkan-pp-history-name{
            font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;
            text-overflow:ellipsis;margin-bottom:6px;
          }
          /* ★ 优化二：黑夜模式次级文字提亮，保证在深色卡片上清晰可读 */
          .hhkan-pp-history-cat{font-size:10.5px;color:#c8c8d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          .hhkan-pp-history-time{font-size:10.5px;color:#a8a8b6;margin-top:4px;}
          .hhkan-pp-history-del{
            position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;
            border:none;background:rgba(0,0,0,.55);color:#fff;font-size:11px;line-height:1;
            cursor:pointer;display:none;align-items:center;justify-content:center;
            transition:background .15s,transform .12s;
          }
          .hhkan-pp-history-card:hover .hhkan-pp-history-del{display:flex;}
          .hhkan-pp-history-del:hover{background:#ff4d4d;transform:scale(1.12);}
          /* 背景类记录用 16:9 展示 */
          .hhkan-pp-tab-pane[data-pane="history"] #hhkan-uc-history-grid .hhkan-pp-history-img{aspect-ratio:16/9;}

          /* ==================== 使用记录 · 双主题配色（优化三 · 内嵌版）====================
             ★ 黑夜：近黑底 + 暖白字 + 蓝灰次级信息；
             ★ 白天（[data-pp-theme="light"]）：白底 + 近黑字 + 中灰次级信息，
             保证两种模式下卡片文字都清晰可读。 */
          html[data-pp-theme="light"] .hhkan-pp-history-card{
            background:#ffffff;border-color:rgba(0,0,0,.09);box-shadow:0 2px 10px rgba(0,0,0,.06);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-card:hover{
            border-color:#2563eb;box-shadow:0 8px 24px rgba(37,99,235,.18);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-name{color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-history-cat{color:#4a4a55;}
          html[data-pp-theme="light"] .hhkan-pp-history-time{color:#5a5a63;}
          html[data-pp-theme="light"] .hhkan-pp-history-card-nick{
            border-color:rgba(214,158,0,.35);background:rgba(255,214,0,.10);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-nick-name{
            color:#7a5c00;background:none;-webkit-text-fill-color:#7a5c00;background-clip:border-box;
          }
          html[data-pp-theme="light"] .hhkan-pp-history-img{
            background-color:#f1f3f5;border-color:rgba(0,0,0,.06);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-empty{
            background:rgba(0,0,0,.02);border-color:rgba(0,0,0,.12);
          }
          html[data-pp-theme="light"] .hhkan-pp-history-empty-text{color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-history-empty-sub{color:#6b6b70;}
          html[data-pp-theme="light"] .hhkan-pp-hs-item{
            background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.22);color:#2563eb;
          }
          html[data-pp-theme="light"] .hhkan-pp-hs-item b{color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-hfilter{
            background:#ffffff;border-color:rgba(0,0,0,.14);color:#3c3c43;
          }
          html[data-pp-theme="light"] .hhkan-pp-hfilter:hover{border-color:#2563eb;color:#1c1c1e;}
          html[data-pp-theme="light"] .hhkan-pp-hfilter-active{
            background:linear-gradient(135deg,#2563eb,#38bdf8);color:#fff;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    ensureEntryButton();
    ensureUserCenterTab();     // ★ 在用户中心 header 追加「修改资料」选择夹
    watchUserCenterReset();    // ★ 切到其它选择夹时自动还原 main 区
    applyProfileToPage();

    // MutationObserver 兜底：profile-box 重建 / info-swiper 渲染后自动重应用
    try{
        const host = document.querySelector(PROFILE_SEL.entryPoint) || document.body;
        let _profileObsTimer = null;
        let _profileObsPending = false;
        const obs = new MutationObserver(()=>{
            // ★ 防抖 + 递归保护：避免回调中修改 DOM 再次触发回调导致无限循环
            if(_profileObsPending) return;
            clearTimeout(_profileObsTimer);
            _profileObsTimer = setTimeout(()=>{
                _profileObsPending = true;
                try{
                    ensureEntryButton();
                    ensureUserCenterTab();
                    applyProfileToPage();
                }finally{
                    // 让当前微任务队列清空后再允许下一次触发
                    setTimeout(()=>{ _profileObsPending = false; }, 0);
                }
            }, 300);
        });
        // ★ 只监听 childList 变化，不监听 attributes 和 characterData，减少触发频率
        obs.observe(host, { childList:true, subtree:true, attributes:false, characterData:false });
        // 全局兜底（路由切换后 user-box 重新渲染）
        const obs2 = new MutationObserver(debounce(()=> applyProfileToPage(), 200));
        obs2.observe(document.body, { childList:true, subtree:true, attributes:false, characterData:false });
    }catch(e){}

    console.log('[个人中心] ✅ 已启用：修改资料（抽屉 + 用户中心内嵌选择夹）');
}

waitDomReady(initProfile);
// ====================================================================

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

/* ============================================================
 * hhkan0.com 体验增强模块（独立，可注入到「好好看进阶五.JS」末尾）
 * 功能：
 *  1. 片尾到点自动跳转下一集（下一集优先复用 navigateEpisode，自动识别当前线路）
 *  2. 全局键盘快捷键（68 / 75 配列适配；全屏快捷键仅在影片有画面时生效）
 *  3. 观看历史记录 + 进度百分比 + 任务栏「继续观看」入口（单条删除 + 清空全部）
 *  4. 任务栏「⚙ 全局设置」弹窗（集中管理参数，实时存 localStorage）
 *  5. 进入播放页自动全屏（严格：仅当影片已渲染出画面后才请求全屏）
 * 依赖：原脚本已暴露的 getVideoBounds / showFloatTip / ensureFloatBall /
 *       saveSelectRecord / getSelectRecord / extractAllLines / navigateEpisode 等
 *      （尽力兼容，缺失不报错）
 * 存储 key：hhkan_enhance_settings / hhkan_watch_history
 * ============================================================ */

/* ============================================================
 * ★★★ 账号体系模块（新增 · 与"继续观看"绑定）
 * ------------------------------------------------------------
 * 设计目标（对应需求）：
 *   1. 用户在当前网址登录账号 → 记录该账号（localStorage: hhkan_account）；
 *   2. 观看记录按【账号】维度隔离 —— 登录后，"继续观看"里的影片进度
 *      会同步写入"账号云盘"(hhkan_account_history_<username>)；
 *   3. 用户再次登录【原账号】→ 自动把该账号名下的记录合并回本地
 *      "继续观看"列表，实现跨会话/跨设备（导入备份）的进度同步；
 *   4. 未登录时走【游客】模式，复用原有 hhkan_watch_history，完全无侵入。
 *
 * 说明：纯前端环境无真实后端，故以"账号名"为维度在 localStorage 分桶
 *       （每个账号一份 hhkan_account_history_<username>）模拟云端；
 *       同一浏览器内天然互通；换设备/换浏览器通过【导出/导入备份】迁移。
 * ============================================================ */
(function () {
    'use strict';
    // ---- 存储键 ----
    const ACC_KEY         = 'hhkan_account';                 // 当前登录账号 {username,loggedAt}
    const ACC_HIST_PREFIX = 'hhkan_account_history_';        // 账号云盘前缀 + username
    const ACC_LIST_KEY    = 'hhkan_account_list';            // 本机记住的账号清单（用于下拉切换）

    // ---------- 工具 ----------
    function _safeGet(key, def) {
        try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
        catch (e) { return def; }
    }
    function _safeSet(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { }
    }
    function _normName(name) {
        return String(name || '').trim().toLowerCase();      // 账号名不区分大小写
    }
    // 账号云盘 key（空名安全兜底为 guest）
    function _cloudKey(username) {
        return ACC_HIST_PREFIX + (_normName(username) || 'guest');
    }

    // ---------- 当前账号状态 ----------
    function currentAccount() {
        const a = _safeGet(ACC_KEY, null);
        return (a && a.username) ? a : null;
    }
    function isLoggedIn() {
        return !!currentAccount();
    }

    // ---------- 读取 / 写入 某账号的云盘记录 ----------
    // 每条记录结构与原有观看记录一致：{key,title,url,ep,total,prevTotal,duration,currentTime,percent,updatedAt}
    function loadCloudHistory(username) {
        if (!_normName(username)) return [];
        return _safeGet(_cloudKey(username), []);
    }
    function saveCloudHistory(username, arr) {
        if (!_normName(username)) return;
        _safeSet(_cloudKey(username), (arr || []).slice(0, 200));
    }

    // ★ 【优化三】账号装饰信息（头像 / 背景图 / 昵称）按账号分桶存取
    //   存储键：hhkan_acc_profile_<username> = { avatar, bg, nick, nickColor }
    //   退出登录时保存当前装饰到该账号桶，登录时自动恢复该账号的装饰，
    //   实现「换账号不串装饰、同账号重登自动还原」。
    const ACC_PROFILE_PREFIX = 'hhkan_acc_profile_';
    function _accProfileKey(username) {
        return ACC_PROFILE_PREFIX + (_normName(username) || 'guest');
    }
    // 保存当前全局装饰信息到指定账号桶
    function saveProfileToAccount(username) {
        if (!_normName(username)) return;
        try {
            const profile = {
                avatar: localStorage.getItem('hhkan_profile_avatar') || '',
                bg: localStorage.getItem('hhkan_profile_bg') || '',
                nick: localStorage.getItem('hhkan_profile_nick') || '',
                nickColor: localStorage.getItem('hhkan_profile_nick_color') || '',
                savedAt: Date.now()
            };
            _safeSet(_accProfileKey(username), profile);
            console.log('[账号] ✅ 装饰信息已保存到账号「' + username + '」');
        } catch (e) { console.warn('[账号] 保存装饰信息失败', e); }
    }
    // 从指定账号桶恢复装饰信息到全局
    function loadProfileFromAccount(username) {
        if (!_normName(username)) return false;
        const profile = _safeGet(_accProfileKey(username), null);
        if (!profile) return false;
        try {
            if (profile.avatar) localStorage.setItem('hhkan_profile_avatar', profile.avatar);
            if (profile.bg) localStorage.setItem('hhkan_profile_bg', profile.bg);
            if (profile.nick) localStorage.setItem('hhkan_profile_nick', profile.nick);
            if (profile.nickColor) localStorage.setItem('hhkan_profile_nick_color', profile.nickColor);
            console.log('[账号] ✅ 已恢复账号「' + username + '」的装饰信息');
            return true;
        } catch (e) { return false; }
    }

    // ---------- 登录 ----------
    // username：账号名（字符串）
    // 返回 { ok, account, merged }：merged = 本次从云盘同步合并进本地的条数
    function accountLogin(rawName) {
        const name = String(rawName || '').trim();
        if (!name) { console.warn('[账号] 登录失败：账号名不能为空'); return { ok: false }; }
        const norm = _normName(name);   // ★ 账号名不区分大小写，统一以小写归一化作为唯一标识
        const prev = currentAccount();
        // 记录到"记住的账号清单"
        const list = (function () {
            const arr = _safeGet(ACC_LIST_KEY, []);
            return Array.isArray(arr) ? arr : [];
        })();
        if (!list.includes(norm)) list.push(norm);
        _safeSet(ACC_LIST_KEY, list);

        // ★ 关键：登录时先做【双向合并】
        //   ① 本地 → 云盘：把登录前"游客态"已看的影片进度归入该账号（避免丢记录）
        _flushLocalToCloud(norm);
        //   ② 云盘 → 本地：再将该账号云端记录同步回本地继续观看（含其它会话/设备导入的）
        const merged = _syncCloudToLocal(norm);

        // ★ 【优化三】登录时：把当前全局装饰信息先存到「上一个账号」（若有），
        //   再从「本次登录账号」的桶里恢复其专属装饰（头像/背景/昵称/颜色）。
        if (prev && prev.username && prev.username !== norm) {
            saveProfileToAccount(prev.username);
        }
        loadProfileFromAccount(norm);

        // 落盘当前账号
        _safeSet(ACC_KEY, { username: norm, loggedAt: Date.now() });

        console.log('[账号] ✅ 登录成功：', norm, '| 同步合并', merged, '条观看记录');
        if (window.showFloatTip && (!prev || prev.username !== norm)) {
            window.showFloatTip('已登录账号「' + norm + '」，已同步' + merged + '条观看记录');
        }
        // 触发全局事件，便于 UI 刷新
        _emit('hhkan:account-login', { username: norm, merged: merged });
        return { ok: true, account: currentAccount(), merged: merged };
    }

    // ---------- 登出 ----------
    function accountLogout() {
        const a = currentAccount();
        if (!a) return;
        // 登出前，把当前本地最新进度【先回写云盘】一次，避免丢失未同步的进度
        if (typeof window.__hhkanFlushHistory === 'function') {
            try { window.__hhkanFlushHistory(); } catch (e) { }
        }
        _flushLocalToCloud(a.username);
        // ★ 【优化三】登出时保存当前装饰信息（头像/背景/昵称/颜色）到该账号桶，
        //   下次同账号登录时自动恢复
        saveProfileToAccount(a.username);
        localStorage.removeItem(ACC_KEY);
        console.log('[账号] 已登出：', a.username);
        _emit('hhkan:account-logout', { username: a.username });
    }

    // ============================================================
    // ★ 同步核心：账号云盘 <--> 本地继续观看
    // ------------------------------------------------------------
    // 规则（以 key=影片标识 为唯一键，双方合并，updatedAt 大的优先）：
    //   - 登录时 / 每次读取历史时：云盘 → 本地（保证"再登录原账号=同步"）
    //   - 记录进度 / 登出时：本地 → 云盘（保证进度被账号记住）
    // ============================================================

    // ★ 云盘 → 本地：把该账号云盘的记录合并进 hhkan_watch_history，返回合并条数
    function _syncCloudToLocal(username) {
        const cloud = loadCloudHistory(username);
        if (!cloud.length) return 0;
        // 复用主模块接口（同一作用域内的 loadHistory/saveHistory）
        const local = (typeof loadHistory === 'function') ? loadHistory() : [];
        const map = {};
        local.forEach(h => { if (h && h.key) map[h.key] = h; });
        let merged = 0;
        cloud.forEach(c => {
            if (!c || !c.key) return;
            const old = map[c.key];
            // 云端更新（或本地无）→ 覆盖/新增
            if (!old || (parseInt(c.updatedAt, 10) || 0) >= (parseInt(old.updatedAt, 10) || 0)) {
                if (!old) merged++;
                map[c.key] = c;
            }
        });
        const next = Object.values(map).sort((a, b) =>
            (parseInt(b.updatedAt, 10) || 0) - (parseInt(a.updatedAt, 10) || 0));
        if (typeof saveHistory === 'function') saveHistory(next);
        return merged;
    }

    // ★ 本地 → 云盘：把当前本地记录中"该账号可见"的全部进度写入云盘
    function _flushLocalToCloud(username) {
        if (!_normName(username)) return;
        const local = (typeof loadHistory === 'function') ? loadHistory() : [];
        const cloud = loadCloudHistory(username);
        const map = {};
        cloud.forEach(c => { if (c && c.key) map[c.key] = c; });
        local.forEach(h => {
            if (!h || !h.key) return;
            const old = map[h.key];
            if (!old || (parseInt(h.updatedAt, 10) || 0) >= (parseInt(old.updatedAt, 10) || 0)) {
                map[h.key] = h;
            }
        });
        const next = Object.values(map).sort((a, b) =>
            (parseInt(b.updatedAt, 10) || 0) - (parseInt(a.updatedAt, 10) || 0));
        saveCloudHistory(username, next);
    }

    // 事件分发（供 UI 层监听刷新）
    function _emit(name, detail) {
        try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { }
    }

    // ---------- 对外暴露 ----------
    // 挂载到 window，供播放器设置 / UI / recordProgress 钩子调用
    window.HhkanAccount = {
        current: currentAccount,
        isLoggedIn: isLoggedIn,
        login: accountLogin,
        logout: accountLogout,
        // 供 recordProgress 调用的"进度上报"钩子（双写：本地存完后再写云盘）
        reportProgress: function (item) {
            const acc = currentAccount();
            if (!acc || !item || !item.key) return;
            const cloud = loadCloudHistory(acc.username);
            const map = {};
            cloud.forEach(c => { if (c && c.key) map[c.key] = c; });
            const old = map[item.key];
            // 仅当新进度更新时覆盖（保留更新的那条）
            if (!old || (parseInt(item.updatedAt, 10) || 0) >= (parseInt(old.updatedAt, 10) || 0)) {
                map[item.key] = item;
            }
            const next = Object.values(map).sort((a, b) =>
                (parseInt(b.updatedAt, 10) || 0) - (parseInt(a.updatedAt, 10) || 0));
            saveCloudHistory(acc.username, next);
        },
        // 供读取历史前调用：把云盘合并到本地（保证"再登录即同步"）
        beforeReadHistory: function () {
            const acc = currentAccount();
            if (!acc) return 0;
            return _syncCloudToLocal(acc.username);
        },
        // 记住的账号清单（用于下拉切换）
        getAccountList: function () {
            const arr = _safeGet(ACC_LIST_KEY, []);
            const cur = currentAccount();
            const set = Array.isArray(arr) ? arr.slice() : [];
            if (cur && !set.includes(cur.username)) set.push(cur.username);
            return set.reverse();
        },
        // ★ 导出当前账号备份（用于跨设备迁移）
        exportBackup: function () {
            const acc = currentAccount();
            return {
                version: 1,
                account: acc ? acc.username : null,
                history: acc ? loadCloudHistory(acc.username) : [],
                exportAt: Date.now()
            };
        },
        // ★ 导入备份并合并进当前账号云盘
        importBackup: function (backup) {
            const acc = currentAccount();
            if (!acc) { console.warn('[账号] 请先登录再导入备份'); return { ok: false, count: 0 }; }
            if (!backup || !Array.isArray(backup.history)) return { ok: false, count: 0 };
            const cloud = loadCloudHistory(acc.username);
            const map = {};
            cloud.forEach(c => { if (c && c.key) map[c.key] = c; });
            let count = 0;
            backup.history.forEach(h => {
                if (!h || !h.key) return;
                const old = map[h.key];
                if (!old) count++;
                if (!old || (parseInt(h.updatedAt, 10) || 0) >= (parseInt(old.updatedAt, 10) || 0)) {
                    map[h.key] = h;
                }
            });
            const next = Object.values(map).sort((a, b) =>
                (parseInt(b.updatedAt, 10) || 0) - (parseInt(a.updatedAt, 10) || 0));
            saveCloudHistory(acc.username, next);
            _syncCloudToLocal(acc.username);   // 立即同步到本地继续观看
            console.log('[账号] 已导入备份', count, '条 →', acc.username);
            return { ok: true, count: count };
        }
    };

    // ★ 供 recordProgress / 登出前使用的"本地→云盘 刷盘"钩子
    window.__hhkanFlushHistory = function () {
        const acc = currentAccount();
        if (acc) _flushLocalToCloud(acc.username);
    };

    // ====================================================================
    // ★ 【优化三】账号装饰信息 —— 与站点登录/登出表单自动同步
    // --------------------------------------------------------------------
    // 问题：原实现中 HhkanAccount.login / logout 仅在内部定义，站点登录表单
    //   （#loginForm / #registForm）的提交/点击并未调用，导致：
    //   ① 站点登录后账号体系不感知，装饰信息不切换；
    //   ② 登出按钮点击后账号体系不感知，装饰不保存。
    // 修复：通过事件代理 + MutationObserver 监听站点登录/注册/登出按钮，
    //   自动桥接 HhkanAccount.login / logout，实现：
    //   · 登录成功 → 保存上一账号装饰 → 恢复本账号装饰
    //   · 登出成功 → 保存当前装饰到账号 → 清空本地装饰
    //   · 换账号不串装饰，同账号重登还原如初
    // ====================================================================
    function _bindSiteAccountBridge() {
        if (window.__hhkanAccBridgeBound) return;
        window.__hhkanAccBridgeBound = true;

        // ---- 从登录表单中提取账号名（兼容多种结构）----
        function _readUsernameFromForm(formSel) {
            try {
                const form = document.querySelector(formSel);
                if (!form) return '';
                // 优先取 name="username" / name="user" / name="account" 的 input
                const input = form.querySelector(
                    'input[name="username"], input[name="user"], input[name="account"], input[name="name"], input[placeholder*="账号"], input[placeholder*="用户名"]'
                );
                if (input && input.value) return String(input.value).trim();
                // 兜底：取表单内第一个非密码、非空 input
                const all = form.querySelectorAll('input[type="text"], input:not([type])');
                for (const el of all) {
                    if (el.type !== 'password' && el.value) return String(el.value).trim();
                }
            } catch (e) { }
            return '';
        }

        // ---- 判断某元素是否为登录/登出按钮 ----
        function _isLoginBtn(el) {
            if (!el) return false;
            const txt = (el.textContent || '').trim();
            const cls = (el.className || '') + ' ' + (el.id || '');
            if (/^登录$|登录$/i.test(txt) || /login/i.test(cls)) return true;
            if (el.type === 'submit' && /login|登录/i.test(txt + cls)) return true;
            return false;
        }
        function _isLogoutBtn(el) {
            if (!el) return false;
            const txt = (el.textContent || '').trim();
            const cls = (el.className || '') + ' ' + (el.id || '');
            if (/^登出$|^退出$|退出登录|安全退出/i.test(txt)) return true;
            if (/logout|signout|sign-out|log-out/i.test(cls + txt)) return true;
            return false;
        }

        // ---- 登录处理 ----
        function _handleLogin(formSel) {
            const name = _readUsernameFromForm(formSel);
            if (!name) return false; // 空用户名，不处理
            try {
                if (window.HhkanAccount && typeof window.HhkanAccount.login === 'function') {
                    const result = window.HhkanAccount.login(name);
                    if (result && result.ok) {
                        // 登录成功后重新渲染装饰到页面
                        if (typeof applyProfileToPage === 'function') {
                            setTimeout(applyProfileToPage, 300);
                        }
                        console.log('[账号桥接] ✅ 站点登录 → HhkanAccount.login("' + name + '")');
                        return true;
                    }
                }
            } catch (e) { console.warn('[账号桥接] 登录桥接异常：', e); }
            return false;
        }

        // ---- 登出处理 ----
        function _handleLogout() {
            try {
                if (window.HhkanAccount && typeof window.HhkanAccount.logout === 'function') {
                    window.HhkanAccount.logout();
                    // 登出后清空页面装饰（恢复默认游客态）
                    if (typeof applyProfileToPage === 'function') {
                        setTimeout(applyProfileToPage, 300);
                    }
                    console.log('[账号桥接] ✅ 站点登出 → HhkanAccount.logout()');
                    return true;
                }
            } catch (e) { console.warn('[账号桥接] 登出桥接异常：', e); }
            return false;
        }

        // ---- 点击事件代理（捕获阶段，确保先于站点逻辑执行）----
        document.addEventListener('click', function (e) {
            const target = e.target;
            if (!target || target.nodeType !== 1) return;
            // 登出按钮检测
            let el = target;
            while (el && el !== document.body) {
                if (_isLogoutBtn(el)) { _handleLogout(); return; }
                el = el.parentElement;
            }
            // 登录按钮检测
            el = target;
            while (el && el !== document.body) {
                if (_isLoginBtn(el)) {
                    // 延迟执行，等站点把表单值写入后再读取
                    setTimeout(() => {
                        _handleLogin('#loginForm');
                    }, 100);
                    return;
                }
                el = el.parentElement;
            }
        }, true);

        // ---- 表单提交监听（兼容 submit 事件方式提交）----
        document.addEventListener('submit', function (e) {
            const form = e.target;
            if (!form || form.nodeType !== 1) return;
            const id = form.id || '';
            if (/login/i.test(id)) {
                setTimeout(() => _handleLogin('#' + id), 100);
            }
        }, true);

        // ---- MutationObserver：动态出现的登录/登出按钮也纳入监听 ----
        // （事件代理已在 document 层级，此处主要确保装饰渲染时机）
        try {
            const accObs = new MutationObserver(function () {
                // 账号状态变化时重渲染装饰
                if (typeof applyProfileToPage === 'function') {
                    applyProfileToPage();
                }
            });
            accObs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-acc'] });
        } catch (e) { }

        console.log('[账号桥接] ✅ 站点登录/登出 ↔ 账号装饰 自动同步已启用');
    }
    _bindSiteAccountBridge();
})();
/* ==================== 账号体系模块结束 ==================== */

(function () {
    'use strict';
    const SET_KEY = 'hhkan_enhance_settings';
    const HIST_KEY = 'hhkan_watch_history';
    const BAR_H = (window.BAR_HEIGHT || 48);

    // ---------- 配置（带默认值）----------
    // ★ 快进 / 后退内置默认步长（秒）：当用户未自行设置、或设置值为 0/非法时，
    //   A / D（以及 ← / →）按键统一按此步长快退 / 快进，确保开箱即用（不再"不可用"）。
    const DEFAULT_SEEK_STEP = 10;
    function loadSettings(forceDefault) {
        const def = {
            autoNext: true,        // 片尾到点（视频自然结束）是否自动跳下一集
            keysEnabled: true,     // 快捷键总开关
            // ★ 影片自动放大全屏播放（默认关闭）
            autoFullscreen: false,
            // ★ 网页加速：让图片与页面更快加载（默认开启）
            webAccelerate: true,
            // ★ 自定义快进 / 后退步长（秒）：前进后退共用同一个"步长"数字；
            //   默认 10 秒即开即用；可设 0~600 自定义；0 视为"使用默认 10 秒"
            seekStep: DEFAULT_SEEK_STEP,  // 快进 / 后退步长（→/D 前进，←/A 后退，默认 10 秒）
        };
        try {
            // ★ forceDefault=true（如"恢复默认"）时跳过读取缓存，直接返回内置默认值，
            //   避免已被删除/残留的旧值干扰恢复结果。
            if (forceDefault) return Object.assign({}, def);
            const s = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
            // 兼容旧版缓存：移除已废弃的 skipIntro / skipOutro 字段
            // ★ 【关键修复 BUG 二】autoFullscreen 是现役功能字段，不得删除，否则
            //   勾选「影片自动放大全屏播放」保存后再次打开弹窗会被当作未定义而回退默认值
            //   false，表现为「勾选自动关闭 / 下次打开不显示已开启」。
            delete s.skipIntro; delete s.skipOutro;
            // 旧版曾用单数命名 brightness/saturation/contrast 已并入播放器设置，无需额外清理
            const merged = Object.assign(def, s);
            // ★ 兼容旧版（曾分设 seekForward / seekBackward）：合并为共用步长 seekStep，
            //   取二者较大值迁移；全新安装走默认 seekStep = 0（禁用）
            if ('seekForward' in s || 'seekBackward' in s) {
                const oldFwd = parseInt(s.seekForward, 10) || 0;
                const oldBwd = parseInt(s.seekBackward, 10) || 0;
                merged.seekStep = Math.max(oldFwd, oldBwd);
                delete merged.seekForward;
                delete merged.seekBackward;
            }
            // ★ 取值保护：0~600（秒）；
            //   - 0 视为"使用默认"，【保留原值 0】写入 SET（input 可如实显示"0"），
            //     实际快进时在 applyKey 里再兜底为 DEFAULT_SEEK_STEP，保证始终可用；
            //   - 超出范围 / 非法 才回退到 DEFAULT_SEEK_STEP，保证数据干净。
            const v = parseInt(merged.seekStep, 10);
            merged.seekStep = (!isNaN(v) && v >= 0 && v <= 600) ? v : DEFAULT_SEEK_STEP;
            return merged;
        } catch (e) { return def; }
    }
    function saveSettings(s) { try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) { } }
    let SET = loadSettings();

    // ---------- 观看历史 ----------
    function loadHistory() {
        // ★ 账号绑定：读取前，先把【当前账号云盘】的观看记录合并到本地（保证"再登录原账号=同步"）
        try { if (window.HhkanAccount && window.HhkanAccount.isLoggedIn()) window.HhkanAccount.beforeReadHistory(); } catch (e) { }
        try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]') || []; }
        catch (e) { return []; }
    }
    function saveHistory(arr) {
        try { localStorage.setItem(HIST_KEY, JSON.stringify(arr.slice(0, 200))); } catch (e) { }
    }
    // ★ v7：详情页(/movie/123.html) 与 播放页(/play/123/4.html) 归并到同一 key，
    //   避免「详情页看了电影、进播放页却识别成另一条记录」导致的集数/进度错乱
    function currentMovieKey() {
        const m = location.href.match(/\/(?:movie|play|detail|tv|anime|variety|short)\/(\d+)/);
        if (m) return 'm:' + m[1];
        try {
            const r = JSON.parse(localStorage.getItem('hhkan_select_record') || '{}');
            if (r && r.movieId) return 'm:' + r.movieId;
        } catch (e) { }
        return 'p:' + location.pathname;
    }
    function currentEpisodeNum() {
        try {
            const r = JSON.parse(localStorage.getItem('hhkan_select_record') || '{}');
            if (r.episodeNum) return parseInt(r.episodeNum) || 0;
        } catch (e) { }
        const t = document.title || '';
        const m = t.match(/第\s*(\d+)\s*集/) || location.href.match(/play\/\d+\/(\d+)/);
        return m ? parseInt(m[1] || m[2]) || 0 : 0;
    }
    /**
     * 采集当前影片的总集数（用于"更新到了第几集"提示）
     * 优先复用主脚本已暴露的 extractAllLines()，汇总所有线路的集数取最大值；
     * 采集不到则返回 0（单集/电影，渲染时不展示总集数）。
     */
    /**
     * ★ v8：返回 { total, kind, detectedFrom }
     *   - kind='movie'（单集电影）：total 强制 1，渲染不展示集数、不参与更新检测
     *   - kind='series'（电视剧/动漫）：展示「第X集/共Y集」+「更新了N集」检测
     *   - 多线路取「最大连续集数」，画质分组(isGroup)展开子线路后再取最大值
     * ★ v8 改进：
     *   - 增强电影/剧集判定：结构化数据(JSON-LD/og:type) + URL 路径 + 选集列表 综合判定
     *   - URL 含 /movie/ 且 total<=1 → 强制 movie（避免电影被误判为剧集）
     *   - /play/ 路径下检查选集列表，有选集 → series，无选集 → movie
     *   - 记录 detectedFrom 标记来源，便于调试与回退
     */
    function detectTotalEpisodes() {
        let total = 0, kind = 'series', detectedFrom = '';
        try { // 兜底：页面文本「共N集」（站点渲染，最权威）
            const txt = document.title + ' ' + (document.body ? document.body.innerText.slice(0, 3000) : '');
            const m = txt.match(/共\s*(\d+)\s*集/);
            if (m) { total = parseInt(m[1]) || 0; detectedFrom = 'pageText'; }
        } catch (e) { }
        try {
            if (typeof extractAllLines === 'function') {
                const _lines = extractAllLines();
                let max = 0;
                (_lines || []).forEach(l => {
                    if (l && l.isGroup && l.subLines && l.subLines.length) {
                        l.subLines.forEach(sl => {
                            const n = sl && (typeof sl.total==='number' ? sl.total : (sl.episodes||[]).length);
                            const con = maxConsecutiveEpisode(sl && sl.episodes) || n;
                            if (con > max) max = con;
                            if (n > max) max = n;
                        });
                    } else {
                        const n = l && (typeof l.total==='number' ? l.total : (l.episodes||[]).length);
                        const con = maxConsecutiveEpisode(l && l.episodes) || n;
                        if (con > max) max = con;
                        if (n > max) max = n;
                    }
                });
                if (total <= 0 && max > 0) { total = max; detectedFrom = 'extractAllLines'; }
            }
        } catch (e) { }
        // ★ v8：结构化数据辅助判定（JSON-LD / og:type / meta）
        let structKind = '';
        try {
            const jsonLd = document.querySelector('script[type="application/ld+json"]');
            if (jsonLd && jsonLd.textContent) {
                const data = JSON.parse(jsonLd.textContent);
                if (data && data['@type']) {
                    if (/Movie|TVSeries/.test(data['@type'])) {
                        structKind = data['@type'] === 'Movie' ? 'movie' : 'series';
                    }
                }
            }
        } catch (e) { }
        if (!structKind) {
            try {
                const ogType = document.querySelector('meta[property="og:type"]');
                if (ogType && ogType.content) {
                    if (/movie/i.test(ogType.content)) structKind = 'movie';
                    else if (/tv|series|show/i.test(ogType.content)) structKind = 'series';
                }
            } catch (e) { }
        }
        // ★ v8：URL 路径辅助判定
        const urlLower = (location.href || '').toLowerCase();
        const isMovieUrl = /\/movie\/\d+\.html?$/.test(urlLower) || /\/film\//.test(urlLower);
        const isPlayUrl = /\/play\//.test(urlLower);

        const isSingle = (typeof isMoviePage==='function') ? isMoviePage() : false;

        // ★ v8：综合判定 kind（优先级：结构化数据 > isMoviePage > total > URL > 选集列表）
        if (structKind) {
            kind = structKind;
        } else if (isSingle) {
            kind = 'movie';
        } else if (total > 1) {
            kind = 'series';
        } else if (isMovieUrl && total <= 1) {
            kind = 'movie';
        } else if (isPlayUrl && total <= 1) {
            // /play/ 路径下 total<=1：检查页面是否有选集列表来辅助判断
            const hasEpList = !!document.querySelector('.module-play-list,.episode-list,.play-list,.anthology-list,.num-list');
            kind = hasEpList ? 'series' : 'movie';
        } else {
            kind = 'movie';
        }
        // total=1 且 kind=movie 时保持 1；series 时 total 保持真实值（0 表示未知）
        if (kind === 'movie') total = 1;
        return { total: total, kind: kind, detectedFrom: detectedFrom };
    }
    // ★ v7：一组集数的「最大连续编号」（1,2,3,5 → 3），更贴近真实总集数
    function maxConsecutiveEpisode(eps) {
        if (!eps || !eps.length) return 0;
        const nums = eps.map(e => parseInt(e && (e.num || e.episodeNum)) || 0).filter(n => n > 0);
        if (!nums.length) return eps.length;
        const set = new Set(nums);
        let best = 0;
        for (const start of nums) {
            if (set.has(start - 1)) continue;
            let cur = start, len = 0;
            while (set.has(cur)) { len++; cur++; }
            if (len > best) best = len;
        }
        return best || nums.length;
    }
    /**
     * ★ 集数比对：根据「上次已知总集数(prevTotal)」与「当前总集数(total)」自动判定更新状态
     *   - 返回 { state, delta }：
     *       state: 'updated'  → 当前 total > prevTotal，说明更新了 delta 集（徽标"更新了X集"）
     *              'same'     → 未更新 / 首次记录，显示"更新至X集"
     *              'done'     → 已看到最新（watchedEp >= total），显示"已看完全X集"
     *              'none'     → 总集数未知（total<=0），不展示徽标
     *   - 规则：只有"上次记录过总集数(prevTotal>0)"且"当前变多了"才算"更新了X集"；
     *     若 prevTotal 为空（首次入库），即使 total 有值也只是"更新至X集"，避免误报。
     */
    /**
     * ★ v7：只有「电视剧/动漫」(kind==='series') 才判定「更新了N集」；
     *   电影/综艺单集始终返回 state:'none'，不展示更新徽标。
     *   这样既解决「动漫/电视剧更新了但开屏不显示」，也避免电影被误标「更新了X集」。
     */
    function compareEpisodeUpdate(opts) {
        const total = parseInt(opts.total) || 0;
        const prevTotal = parseInt(opts.prevTotal) || 0;
        const watchedEp = parseInt(opts.watchedEp) || 0;
        const kind = opts.kind || (total > 1 ? 'series' : 'movie');
        if (kind !== 'series') return { state: 'none', delta: 0 }; // ★ 电影/单集永不判定更新
        if (total <= 0) return { state: 'none', delta: 0 };
        if (total > prevTotal && prevTotal > 0) {
            return { state: 'updated', delta: total - prevTotal }; // ★ 更新了N集
        }
        if (watchedEp > 0 && watchedEp >= total) return { state: 'done', delta: 0 };
        return { state: 'same', delta: 0 };
    }
    // ★ v8：提取影片元信息（海报/类型/年份/简介），电影和剧集通用
    //   优先级：og:image > JSON-LD > 页面结构化 img > 异步 fetchMovieDetail 补全
    function extractMovieMeta() {
        var meta = { poster: '', category: '', year: '', intro: '', title: '' };
        try {
            // 1) og:image（最可靠，几乎所有影视站都输出）
            var ogImg = document.querySelector('meta[property="og:image"]');
            if (ogImg && ogImg.content) meta.poster = ogImg.content.trim();
        } catch (e) { }
        if (!meta.poster) {
            try {
                // 2) JSON-LD 里的 image 字段
                var ld = document.querySelector('script[type="application/ld+json"]');
                if (ld && ld.textContent) {
                    var d = JSON.parse(ld.textContent);
                    if (d && d.image) meta.poster = (Array.isArray(d.image) ? d.image[0] : d.image) || '';
                }
            } catch (e) { }
        }
        if (!meta.poster) {
            try {
                // 3) 页面里常见的海报选择器
                var posterSel = document.querySelector('.module-info-poster img,.v-img img,.video-pic img,.detail-poster img,.movie-poster img,[class*="poster"] img,[class*="Pic"] img');
                if (posterSel && posterSel.src) meta.poster = posterSel.src;
            } catch (e) { }
        }
        // 类型：复用已有 getMovieGenreSync
        try { meta.category = (typeof getMovieGenreSync === 'function') ? (getMovieGenreSync() || '') : ''; } catch (e) { }
        // 年份
        try {
            var yr = document.title.match(/(\d{4})\s*年?/);
            if (yr) meta.year = yr[1];
        } catch (e) { }
        // 简介
        try {
            var introEl = document.querySelector('.module-info-intro,.detail-intro,.video-intro,[class*="intro"]');
            if (introEl && introEl.textContent) meta.intro = introEl.textContent.trim().slice(0, 120);
        } catch (e) { }
        // 标题：去掉站点后缀
        meta.title = (document.title || '').replace(/[-_|].*$/, '').trim().slice(0, 60);
        return meta;
    }

    function recordProgress(video) {
        if (!video || !video.duration || !isFinite(video.duration)) return;
        const cur = currentMovieKey();
        if (!cur) return;
        const pct = Math.min(100, Math.round((video.currentTime / video.duration) * 100));
        const ep = currentEpisodeNum();
        // ★ v7：detectTotalEpisodes 现返回 {total, kind}
        const det = detectTotalEpisodes();
        const kind = (det && det.kind) || 'series';
        // ★ 电影/单集：不记录集数（避免"第1集/共1集"误展示），total 统一记为 1
        const isMovie = kind === 'movie';
        const total = isMovie ? 1 : (det && det.total) || 0;
        const epField = isMovie ? 0 : ep; // ★ 电影 ep 恒为 0，渲染走"只显示进度"分支
        // ★ 集数比对：保留「上次已知总集数」用于判定"更新了X集"
        let prevTotal = 0, prevKind = '';
        try {
            const old = loadHistory().find(h => h.key === cur);
            prevTotal = parseInt(old && old.total) || 0;
            prevKind = (old && old.kind) || '';
        } catch (e) { }
        // ★ 历史已确认为剧集 → 即使本次被误判为电影，也保留剧集身份（防止来回抖动）
        if (prevKind === 'series' && kind === 'movie' && total <= 1 && prevTotal > 1) {
            kind = 'series'; total = prevTotal;
        }
        // ★ v8：提取影片元信息（海报/类型/年份/简介），电影和剧集通用
        const _meta = extractMovieMeta();
        // ★ v8：合并旧记录的元信息（海报等只在首次写入，避免每次播放都覆盖）
        let prevPoster = '', prevCategory = '', prevYear = '', prevIntro = '';
        try {
            const oldItem = loadHistory().find(h => h.key === cur);
            if (oldItem) {
                prevPoster = oldItem.poster || '';
                prevCategory = oldItem.category || '';
                prevYear = oldItem.year || '';
                prevIntro = oldItem.intro || '';
            }
        } catch (e) { }
        const item = {
            key: cur,
            title: _meta.title || document.title.replace(/[-_|].*$/, '').trim().slice(0, 60) || location.href,
            url: location.href,
            ep: epField,           // ★ 电影为 0，剧集为当前集数
            total: total,           // 电影恒为 1，剧集为真实总集数（未知时为 0）
            prevTotal: prevTotal,   // 上次记录的总集数（用于自动比对"更新了X集"）
            kind: kind,             // ★ 'movie' | 'series'，决定渲染与更新检测行为
            category: _meta.category || prevCategory || ((typeof getMovieGenreSync==='function') ? getMovieGenreSync() : ''), // ★ 电影/动漫/电视剧
            poster: _meta.poster || prevPoster || '',  // ★ v8：海报图 URL（电影/剧集共用）
            year: _meta.year || prevYear || '',         // ★ v8：年份
            intro: _meta.intro || prevIntro || '',      // ★ v8：简介摘要
            lastCheckedAt: Date.now(), // ★ 最近一次核对总集数的时间
            duration: Math.round(video.duration),
            currentTime: Math.round(video.currentTime),
            percent: pct,
            updatedAt: Date.now()
        };
        const hist = loadHistory().filter(h => h.key !== cur);
        hist.unshift(item);
        saveHistory(hist);
        // ★ 账号绑定：登录后，把本次进度【双写】到账号云盘（保证该账号记住此影片）
        try { if (window.HhkanAccount && window.HhkanAccount.isLoggedIn()) window.HhkanAccount.reportProgress(item); } catch (e) { }
        // 同步到既有 select_record（供收藏/选集模块联动）
        try {
            const r = JSON.parse(localStorage.getItem('hhkan_select_record') || '{}');
            r.url = location.href;
            if (ep) r.episodeNum = ep;
            localStorage.setItem('hhkan_select_record', JSON.stringify(r));
        } catch (e) { }
    }
    // 删除单条历史
    function deleteHistoryItem(key) {
        const hist = loadHistory().filter(h => h.key !== key);
        saveHistory(hist);
    }
    // 清空全部历史
    function clearAllHistory() {
        saveHistory([]);
    }

    // ---------- 片尾到点自动下一集（由 video 'ended' 事件触发，见 bindVideo）----------
    function onTimeUpdate(video) { /* 预留：后续可按需扩展进度相关逻辑 */ }
    // 暴露给外部（播放器设置模块的片尾跳过逻辑），优先使用"识别当前线路"的下一集实现
    window.gotoNextEpisode = gotoNextEpisode;
    function gotoNextEpisode() {
        const ep = currentEpisodeNum();
        // 优先复用主 JS 的 navigateEpisode(1)：它已正确识别"当前线路/当前集"，
        // 并会按当前激活线路找下一集、跨线路时自动切换线路 tab，最符合用户预期。
        if (typeof navigateEpisode === 'function') {
            try {
                navigateEpisode(1);
                if (window.showFloatTip) window.showFloatTip('自动播放下一集');
                return;
            } catch (e) { console.warn('[enhance] navigateEpisode fail, fallback', e); }
        }
        // ---- 兜底：navigateEpisode 不可用时的自主实现 ----
        // 关键：先读取选择记录中的 lineIndex，锁定"当前正在播放的线路"，
        // 避免多线路同名集数时跳到错误线路的下一集。
        const rec = (typeof getSelectRecord === 'function') ? getSelectRecord() : {};
        let curLineIdx = (rec && typeof rec.lineIndex === 'number') ? rec.lineIndex : -1;
        try {
            if (typeof extractAllLines === 'function') {
                const lines = extractAllLines();
                if (lines.length === 0) { if (window.showFloatTip) window.showFloatTip('未检测到选集列表'); return; }
                if (curLineIdx < 0 && typeof autoDetectAndNotify === 'function') {
                    const det = autoDetectAndNotify();
                    if (det && typeof det.lineIndex === 'number') curLineIdx = det.lineIndex;
                }
                let line = (curLineIdx >= 0 && lines[curLineIdx]) ? lines[curLineIdx] : null;
                if (!line || !line.episodes || line.episodes.length === 0) {
                    line = lines.find(l => l.episodes && l.episodes.length > 0) || lines[0];
                }
                const eps = (line.episodes || []).slice().sort((a, b) => (a.num || 0) - (b.num || 0));
                const curNum = ep || 0;
                const nxt = eps.find(e => (e.num || 0) > curNum);
                if (nxt && nxt.url && nxt.url !== location.href) {
                    const activeIdx = (typeof getActiveLineIndex === 'function') ? getActiveLineIndex() : -1;
                    const lineIdx = lines.indexOf(line);
                    if (activeIdx >= 0 && lineIdx >= 0 && lineIdx !== activeIdx && typeof switchLineTab === 'function') {
                        switchLineTab(lineIdx);
                    }
                    if (window.showFloatTip) window.showFloatTip('自动播放下一集');
                    setTimeout(() => { location.href = nxt.url; }, 500);
                    return;
                }
            }
        } catch (e) { console.warn('[enhance] nextEp parse fail', e); }
        // 最终兜底：URL 中 play/id/ep 形式自增
        const next = ep ? ep + 1 : 1;
        const m = location.href.match(/(.*\/play\/\d+\/)(\d+)(\.html)?$/);
        if (m) {
            const url = m[1] + next + (m[3] || '');
            if (window.showFloatTip) window.showFloatTip('自动播放下一集');
            setTimeout(() => { location.href = url; }, 500);
            return;
        }
        if (window.showFloatTip) window.showFloatTip('已是最后一集');
    }

    // ---------- 快捷键 ----------
    // 兼容 68 配列（无独立小键盘，使用主键盘数字行）与 75 配列（带独立数字小键盘，Numpad 生效）
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    // 查找可用视频元素：排除本地播放器遮罩内的视频，优先返回已就绪/可播放的视频
    function getActiveVideo() {
        const all = document.querySelectorAll('video');
        let candidate = null;
        for (const v of all) {
            if (v.closest && v.closest('#local-player-mask')) continue;
            if (!candidate) candidate = v;
            // 优先选择有尺寸且未禁用、readyState 较高的视频
            if (v.videoWidth > 0 && !v.disabled && v.readyState >= 2) return v;
        }
        return candidate;
    }
    // ★ 记住静音前的音量，用于取消静音时恢复（仅本模块内生效，不污染播放器设置）
    let _hhkanMutedVol = null;
    // ★ B 键静音切换：把「播放器设置」里的音量数值直接调成 0，并同步刷新设置弹窗里的滑块/数值显示；
    //   取消静音时恢复到静音前的音量。这样无论是否打开设置弹窗、无论怎么切集，静音状态都真正跟着音量数值走。
    function toggleMute() {
        // 读取当前已保存的音量（0~100）
        let cur = 100;
        try { cur = getPlayerSettings().volume; } catch (e) { }
        if (cur > 0) {
            // ---- 当前有声 → 静音：记下当前值，写入 0 ----
            _hhkanMutedVol = cur;
            try { savePlayerSettings({ volume: 0 }); } catch (e) { }
            syncAllVolume();
            if (window.showFloatTip) window.showFloatTip('已静音 🔇（音量已置为 0）');
        } else {
            // ---- 当前无声 → 取消静音：恢复到静音前的值（兜底 100） ----
            const restore = _hhkanMutedVol && _hhkanMutedVol > 0 ? _hhkanMutedVol : 100;
            _hhkanMutedVol = null;
            try { savePlayerSettings({ volume: restore }); } catch (e) { }
            syncAllVolume();
            if (window.showFloatTip) window.showFloatTip('已取消静音 🔊（音量 ' + restore + '%）');
        }
        // ★ 同步刷新「播放器设置」弹窗里的音量滑块与数值显示（若弹窗正开着）
        try {
            const box = document.querySelector('#player-setting-box');
            if (box) {
                const r = box.querySelector('#vol-range');
                const t = box.querySelector('#vol-val');
                const now = getPlayerSettings().volume;
                if (r) r.value = now;
                if (t) t.textContent = now + '%';
            }
        } catch (e) { }
    }
    function applyKey(e) {
        if (!SET.keysEnabled) return;
        const tag = (e.target && e.target.tagName) || '';
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
        // （已删除）空格键播放/暂停：Spacebar / Space 快捷键已移除，空格恢复为浏览器默认行为
        const v = getActiveVideo();
        if (!v) {
            // ★ 无可用视频时，A / D 等快进退键给出明确提示（而不再是"按了没反应"），
            //   避免用户以为快捷键坏了。其它功能键（B/N/M）走各自逻辑自处理。
            const seekKeys = ['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'];
            if (seekKeys.includes(e.key)) {
                if (window.showFloatTip) window.showFloatTip('暂无可快进的视频');
                e.preventDefault();
            }
            return;
        }
        let handled = true;
        // ★ 快进 / 后退共用同一个步长（秒）：优先取自定义设置，若为 0/非法则兜底用
        //   DEFAULT_SEEK_STEP，保证 A / D（← / →）始终可用，开箱即用。
        const rawStep = Math.max(0, parseInt(SET.seekStep, 10) || 0);
        const step = rawStep > 0 ? rawStep : DEFAULT_SEEK_STEP;
        switch (e.key) {
            case 'ArrowLeft': if (step > 0) v.currentTime = clamp(v.currentTime - step, 0, v.duration || 1e9); else handled = false; break;
            case 'ArrowRight': if (step > 0) v.currentTime = clamp(v.currentTime + step, 0, v.duration || 1e9); else handled = false; break;
            case 'a': case 'A': if (step > 0) v.currentTime = clamp(v.currentTime - step, 0, v.duration || 1e9); else handled = false; break;
            case 'd': case 'D': if (step > 0) v.currentTime = clamp(v.currentTime + step, 0, v.duration || 1e9); else handled = false; break;
            // ★ B 键：静音切换 —— 把「播放器设置」里的音量数值直接置 0（而非只切单个 video 的 muted）
            //   逻辑：静音时先记住当前音量到 _hhkanMutedVol，再写入 0；取消静音时恢复到 _hhkanMutedVol。
            //   这样「设置弹窗里的音量数值也会跟着变成 0」，且切集/新视频按设置同步时依然保持静音，
            //   不会像单纯 v.muted=!v.muted 那样一换集就恢复原音量。
            case 'b': case 'B': toggleMute(); break;
            case 'n': case 'N': gotoNextEpisode(); break;
            // ★ 全屏快捷键：M / m —— 切换当前影片窗口的全屏状态（进入 / 退出）
            case 'm': case 'M': toggleFullscreen(); break;
            // （已删除）跳过进度快捷键：原数字键 0-9 / Numpad0-9 跳到 0%-90% 进度已移除
            // （已删除）空格键播放/暂停：Spacebar / Space 已移除
            default: handled = false;
        }
        if (handled) e.preventDefault();
    }

    // ---------- 绑定视频 ----------
    function bindVideo(video) {
        if (video._hhkanBound) return;
        video._hhkanBound = true;
        video._hhkanNextFired = false;
        video.addEventListener('timeupdate', () => { onTimeUpdate(video); recordProgress(video); });
        video.addEventListener('loadedmetadata', () => { video._hhkanNextFired = false; });
        // 影片自然播放结束 + autoNext 开启 -> 自动续播下一集
        video.addEventListener('ended', () => {
            if (!SET.autoNext) return;
            if (!video._hhkanNextFired) {
                video._hhkanNextFired = true;
                gotoNextEpisode();
            }
        });
    }
    function watchForVideo() {
        const v = document.querySelector('video');
        if (v) bindVideo(v);
    }

    // ---------- 设置弹窗（UI 名称：全局设置）----------
    function openSettings() {
        if (document.querySelector('#hhkan-enhance-settings')) return;
        if (!requestOpenModal('hhkan-enhance-settings')) return;
        const mask = document.createElement('div');
        mask.id = 'hhkan-enhance-settings';
        mask.innerHTML = `
        <div class="hes-box">
            <div class="hes-head"><span>⚙ 全局设置</span><button class="hes-close" type="button" aria-label="关闭">×</button></div>
            <div class="hes-body">
                <label class="hes-row hes-check"><span><i class="hes-icon">🖥️</i>影片自动放大全屏播放</span>
                    <input type="checkbox" data-k="autoFullscreen" ${SET.autoFullscreen ? 'checked' : ''}>
                </label>
                <div class="hes-divider"></div>
                <label class="hes-row hes-check"><span><i class="hes-icon">⚡</i>网页加速（更快加载画面）</span>
                    <input type="checkbox" data-k="webAccelerate" ${SET.webAccelerate !== false ? 'checked' : ''}>
                </label>
                <div class="hes-divider"></div>
                <label class="hes-row hes-check"><span><i class="hes-icon">⏭️</i>片尾到点自动播放下一集</span>
                    <input type="checkbox" data-k="autoNext" ${SET.autoNext ? 'checked' : ''}>
                </label>
                <div class="hes-divider"></div>
                <label class="hes-row hes-check"><span><i class="hes-icon">⌨️</i>启用全局快捷键</span>
                    <input type="checkbox" data-k="keysEnabled" ${SET.keysEnabled ? 'checked' : ''}>
                </label>
                <div class="hes-divider"></div>
                <div class="hes-row hes-num">
                    <span><i class="hes-icon">⏩</i>快进 / 后退步长（秒）</span>
                    <div class="hes-num-wrap">
                        <input type="number" min="0" max="600" step="1" data-k="seekStep" value="${SET.seekStep}" placeholder="默认 10">
                        <span class="hes-num-unit">秒</span>
                    </div>
                </div>
                <!-- ★ 【优化二】输入框聚焦提示：说明"填 0 即叠加 10 秒"的规则 -->
                <div class="hes-tip" id="hes-seek-tip">
                    <span class="hes-tip-icon">💡</span>
                    <span class="hes-tip-text">填 <b>0</b> 或不填 = 使用默认 <b>10 秒</b>（叠加 = 在当前秒数上再增加）</span>
                </div>
                <div class="hes-divider"></div>
                <div class="hes-keymap" id="hes-keymap">
                    <div class="hes-keymap-title">⌨️ 快捷键说明 <span class="hes-keymap-badge">68 / 75 配列通用</span></div>
                    <table class="hes-keymap-table">
                        <thead><tr><th class="col-icon"></th><th class="col-func">功能</th><th class="col-key">快捷键</th><th class="col-desc">说明</th></tr></thead>
                        <tbody>
                            <tr><td class="col-icon">⏯️</td><td class="col-func">播放 / 暂停</td><td class="col-key"><kbd>Spacebar</kbd></td><td class="col-desc">切换视频的播放与暂停状态</td></tr>
                            <tr><td class="col-icon">⏪</td><td class="col-func">快退 ${SET.seekStep > 0 ? SET.seekStep : DEFAULT_SEEK_STEP} 秒</td><td class="col-key"><kbd>←</kbd> <span class="key-or">或</span> <kbd>A</kbd></td><td class="col-desc">向左方向键 / A 键，进度回退 ${SET.seekStep > 0 ? SET.seekStep : DEFAULT_SEEK_STEP} 秒（步长可在上方设置，默认 10 秒即开即用）</td></tr>
                            <tr><td class="col-icon">⏩</td><td class="col-func">快进 ${SET.seekStep > 0 ? SET.seekStep : DEFAULT_SEEK_STEP} 秒</td><td class="col-key"><kbd>→</kbd> <span class="key-or">或</span> <kbd>D</kbd></td><td class="col-desc">向右方向键 / D 键，进度前进 ${SET.seekStep > 0 ? SET.seekStep : DEFAULT_SEEK_STEP} 秒（与快退共用同一"步长"数字，填 0 也按默认 10 秒生效）</td></tr>
                            <tr><td class="col-icon">⏭️</td><td class="col-func">播放下一集</td><td class="col-key"><kbd>N</kbd></td><td class="col-desc">手动跳转到当前线路的下一集</td></tr>
                            <tr><td class="col-icon">🔇</td><td class="col-func">静音切换</td><td class="col-key"><kbd>B</kbd></td><td class="col-desc">把「播放器设置」里的音量数值直接置为 0（弹窗内滑块同步归零），再按一次恢复原音量，切集后仍保持静音</td></tr>
                            <tr><td class="col-icon">🖥️</td><td class="col-func">全屏播放</td><td class="col-key"><kbd>M</kbd></td><td class="col-desc">一键将当前影片窗口切换为全屏，再按一次退出全屏</td></tr>
                        </tbody>
                    </table>
                    <div class="hes-keymap-sub"><b>配列提示：</b>68 键紧凑布局无独立小键盘，方向键 + A/D 更靠中；75 键保留标准右侧小键盘，数字输入与方向键互不冲突。（数字键跳进度功能已移除）</div>
                    <div class="hes-keymap-sub"><b>注意：</b>在输入框 / 搜索框中按键不会触发快捷键；播放/暂停仅响应 <kbd>Spacebar</kbd>（已移除 P / K）。</div>
                </div>
            </div>
            <div class="hes-foot">
                <button type="button" class="hes-reset">恢复默认</button>
                <button type="button" class="hes-save">保存</button>
            </div>
        </div>`;
        document.body.appendChild(mask);
        const close = () => mask.remove();
        mask.querySelector('.hes-close').onclick = close;
        mask.onclick = (e) => { if (e.target === mask) close(); };

        // ★ 【优化二】步长输入框聚焦时显示提示条，说明「填 0 即叠加默认 10 秒」的规则
        const seekInput = mask.querySelector('input[data-k="seekStep"]');
        const seekTip = mask.querySelector('#hes-seek-tip');
        if (seekInput && seekTip) {
            seekInput.addEventListener('focus', () => seekTip.classList.add('hes-tip-show'));
            seekInput.addEventListener('blur', () => seekTip.classList.remove('hes-tip-show'));
        }

        // ★ 操作成功弹窗：点击「保存 / 恢复默认」后弹出，明确告知用户结果（比轻提示更醒目）。
        //   opt = { type:'save'|'reset', title, desc }
        //   单例：若已存在则先移除，避免连续点击堆叠；点击「我知道了」或遮罩即关闭。
        function openResultModal(opt) {
            const old = document.querySelector('#hes-result-modal');
            if (old) old.remove();
            const isSave = opt.type === 'save';
            const box = document.createElement('div');
            box.id = 'hes-result-modal';
            box.innerHTML = `
            <div class="hes-result-mask">
                <div class="hes-result-box">
                    <div class="hes-result-icon">${isSave ? '✅' : '↺'}</div>
                    <div class="hes-result-title">${opt.title || (isSave ? '保存成功' : '已恢复默认')}</div>
                    <div class="hes-result-desc">${opt.desc || ''}</div>
                    <button type="button" class="hes-result-ok">我知道了</button>
                </div>
            </div>`;
            document.body.appendChild(box);
            const closeResult = () => box.remove();
            box.querySelector('.hes-result-ok').onclick = closeResult;
            box.querySelector('.hes-result-mask').onclick = (e) => { if (e.target === box) closeResult(); };
            // 兜底：3 秒后自动关闭，防止用户不看就离开
            setTimeout(closeResult, 3000);
        }
        // 暴露给模块内两处按钮使用
        window.__openHesResultModal = openResultModal;

        // ★ 功能项中文名映射（用于弹窗展示"开启了 / 关闭了 XX"）
        const _settingNameMap = {
            autoFullscreen: '影片自动放大全屏播放',
            webAccelerate: '网页加速',
            autoNext: '片尾自动播放下一集',
            keysEnabled: '全局快捷键'
        };

        mask.querySelector('.hes-save').onclick = () => {
            // ★ 保存前的旧值快照（用于对比哪些项发生了变更）
            const prev = Object.assign({}, SET);
            mask.querySelectorAll('input[data-k]').forEach(inp => {
                const k = inp.dataset.k;
                if (inp.type === 'checkbox') SET[k] = inp.checked;
                else if (inp.type === 'number') {
                    // ★ 忠实保存用户输入：空 / 非法 → 0（即"使用默认 10 秒"），
                    //   0~600 范围内原样保留（含 0），不做"0 强制改成 10"的暗转，
                    //   保证"填 0 也按默认 10 秒生效"且保存后值真实可查。
                    const raw = parseInt(inp.value, 10);
                    SET[k] = (!isNaN(raw) && raw >= 0 && raw <= 600) ? raw : 0;
                }
            });
            saveSettings(SET);   // ★ 立即把最新 SET 写回 localStorage，确保全局真正持久化

            // ★ 网页加速开关实时生效：开启则立即应用，关闭则立即移除
            if(typeof syncWebAccelerate === 'function'){
                syncWebAccelerate();
            }
            // ★ 同步到播放器设置（getPlayerSettings 也读取 webAccelerate / autoFullscreen），
            //   保证「播放器设置弹窗」与「全局设置」两处改动同源
            try{ savePlayerSettings({webAccelerate: SET.webAccelerate, autoFullscreen: SET.autoFullscreen}); }catch(e){}

            // ★ 无论值是否变化，均收集「开关类」功能的当前状态，弹窗统一告知用户
            //   选中 = 开启，取消选中 = 关闭，每条都明确列出
            const switchLines = ['autoFullscreen', 'webAccelerate', 'autoNext', 'keysEnabled'].map(k => {
                const name = _settingNameMap[k] || k;
                const on = !!SET[k];
                return `<b>${name}</b>：${on ? '✅ 已开启' : '⏹ 已关闭'}`;
            });
            const stepVal = SET.seekStep > 0 ? SET.seekStep : '默认 10';
            const desc =
                switchLines.join('<br>') +
                `<br><b>快进 / 后退步长</b>：${stepVal} 秒`;

            close();         // 先关闭「全局设置」弹窗，再弹出结果弹窗（避免遮罩堆叠）
            // ★ 始终弹出结果弹窗（选中 / 取消选中 / 未改动，都会显示）
            if (typeof window.__openHesResultModal === 'function') {
                window.__openHesResultModal({
                    type: 'save',
                    title: '保存成功',
                    desc: desc
                });
            } else if (window.showFloatTip) {
                window.showFloatTip('全局设置已保存');
            }
        };
        mask.querySelector('.hes-reset').onclick = () => {
            // ★ 以默认定义为基准重建一份全新的设置（含默认值 10 秒），写回内存 + 持久化
            SET = loadSettings(true);            // 清空缓存，用内置默认值重新初始化
            saveSettings(SET);                    // 立即把默认值落地到 localStorage
            // ★ 同步把当前弹窗内的表单控件重置为默认值，让 UI 即时反映"已恢复"，避免看着没变化
            mask.querySelectorAll('input[data-k]').forEach(inp => {
                const k = inp.dataset.k;
                if (k in SET) {
                    if (inp.type === 'checkbox') inp.checked = !!SET[k];
                    else if (inp.type === 'number') inp.value = SET[k];
                }
            });
            close();         // 先关闭「全局设置」弹窗，再弹出结果弹窗
            if (typeof window.__openHesResultModal === 'function') {
                window.__openHesResultModal({
                    type: 'reset',
                    title: '已恢复默认',
                    desc: '所有全局设置已重置为初始值（快进步长 10 秒，自动下一集 / 快捷键均开启）。'
                });
            } else if (window.showFloatTip) {
                window.showFloatTip('已恢复默认');
            }
        };
    }
    // ★ 暴露给任务栏事件代理（函数在模块 IIFE 内，需显式挂到 window 中转）
    try{ (window.__hhkanActions = window.__hhkanActions || {}).settings = openSettings; }catch(e){}

    // ★ v7：render 提升到 openContinueWatch 作用域（模块私有），供 runSplashUpdateCheck
    //   在「继续观看」弹窗已打开时主动刷新徽标；弹窗未打开时为 no-op，安全无害。
    let __renderContinueList = null;
    // ---------- 继续观看弹窗（支持单条删除 + 清空全部）----------
    function openContinueWatch() {
        if (document.querySelector('#hhkan-continue-mask')) return;
        if (!requestOpenModal('hhkan-continue-mask')) return;
        const render = () => {
            const hist = loadHistory();
            const list = document.getElementById('hhkan-continue-list');
            const empty = document.getElementById('hhkan-continue-empty');
            if (!list) return;
            if (!hist.length) {
                list.innerHTML = '';
                if (empty) empty.style.display = 'block';
                return;
            }
            if (empty) empty.style.display = 'none';
            list.innerHTML = hist.slice(0, 30).map(h => {
                const pct = h.percent || 0;
                const ep = h.ep ? `第${h.ep}集` : '';
                // ★ v8：series 才显示集数，movie 只显示进度（不出现"第1集/共1集"）
                const kind = h.kind || (parseInt(h.total) > 1 ? 'series' : 'movie');
                let epPart = '';
                if (kind === 'series') {
                    const total = parseInt(h.total) || 0;
                    epPart = ep ? (total > 0 ? `${ep} / 共${total}集` : ep) : (total > 0 ? `共${total}集` : '');
                }
                // ★ 更新徽标：仅 series 参与（compareEpisodeUpdate 内部也已拦截 movie）
                let updateBadge = '';
                if (kind === 'series') {
                    const total = parseInt(h.total) || 0;
                    const prevTotal = parseInt(h.prevTotal) || 0;
                    const watchedEp = parseInt(h.ep) || 0;
                    const upd = compareEpisodeUpdate({ total: total, prevTotal: prevTotal, watchedEp: watchedEp, kind: kind });
                    if (upd.state === 'updated') {
                        updateBadge = `<span class="hc-update hc-update-new">🆕 更新了<b>${upd.delta}</b>集（更新至第${total}集）</span>`;
                    } else if (upd.state === 'done') {
                        updateBadge = `<span class="hc-update hc-update-done">✅ 已看完全${total}集</span>`;
                    } else if (upd.state === 'same' && total > 0) {
                        updateBadge = `<span class="hc-update hc-update-static">更新至第${total}集</span>`;
                    }
                }
                // ★ v8：类型标签（电影/动漫/电视剧），带年份后缀
                let typeTag = '';
                const cat = (h.category && h.category.split(',')[0].trim()) || (kind === 'movie' ? '电影' : (kind === 'series' ? '剧集' : ''));
                const yearStr = h.year ? ` · ${h.year}` : '';
                typeTag = `<span class="hc-type-tag">${cat}${yearStr}</span>`;
                // ★ v8：海报缩略图（电影/剧集通用，有则显示）
                const posterHtml = h.poster
                    ? `<div class="hc-poster"><img src="${h.poster}" alt="" loading="lazy" onerror="this.style.display='none'"></div>`
                    : `<div class="hc-poster hc-poster-none"><span class="hc-poster-placeholder">${cat.charAt(0) || '🎬'}</span></div>`;
                return `<div class="hc-item" data-key="${h.key}" data-kind="${kind}">
                    ${posterHtml}
                    <a class="hc-item-main" href="${h.url}" title="${h.title}">
                        <div class="hc-title">${typeTag}${h.title}${updateBadge}</div>
                        <div class="hc-meta">${epPart ? epPart + ' · ' : ''}看到 ${pct}%</div>
                        <div class="hc-bar"><i style="width:${pct}%"></i></div>
                    </a>
                    <button type="button" class="hc-del" data-key="${h.key}" title="删除该影片记录">删除</button>
                </div>`;
            }).join('');
            // 绑定单条删除按钮
            list.querySelectorAll('.hc-del').forEach(btn => {
                btn.onclick = (ev) => {
                    ev.preventDefault(); ev.stopPropagation();
                    const key = btn.dataset.key;
                    deleteHistoryItem(key);
                    render(); // 重新渲染
                    if (window.showFloatTip) window.showFloatTip('已删除该影片记录');
                };
            });
        };
        const mask = document.createElement('div');
        mask.id = 'hhkan-continue-mask';
        mask.innerHTML = `<div class="hc-box">
            <div class="hc-head"><span>⏯ 继续观看</span>
                <span class="hc-head-actions">
                    <button type="button" class="hc-btn hc-export" title="导出观看记录为文件">📤 导出</button>
                    <button type="button" class="hc-btn hc-import" title="从文件导入观看记录">📥 导入</button>
                    <button type="button" class="hc-clearall" title="清空全部观看记录">清空全部</button>
                    <button type="button" class="hc-close" aria-label="关闭">×</button>
                </span>
            </div>
            <div class="hc-list" id="hhkan-continue-list"></div>
            <div class="hc-empty" id="hhkan-continue-empty" style="display:none;">暂无观看记录</div>
        </div>`;
        document.body.appendChild(mask);
        render();

        // ★ 【优化一】导出观看记录：支持自定义保存位置 + 自定义文件名，
        //   默认文件名自带日期时间，导出完成后弹出精美结果弹窗
        mask.querySelector('.hc-export').onclick = async () => {
            const hist = loadHistory();
            if (!hist.length) {
                // ★ 没有内容：用独立弹窗，避免被继续观看遮罩压住而看不见
                _showImportExportNotice('没有东西可导出', '当前还没有任何观看记录，看几部片子再来备份吧~', '🙂');
            }
            const data = {
                app: '好好看',
                version: 'v0.0.6',
                exportAt: Date.now(),
                count: hist.length,
                history: hist
            };
            const json = JSON.stringify(data, null, 2);
            // 默认文件名：自带日期时间，方便区分
            const defDate = (() => {
                const d = new Date();
                const p = n => String(n).padStart(2, '0');
                return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
            })();
            const defaultName = `好好看_继续观看记录_${defDate}.json`;

            // 优先使用 File System Access API（支持自定义保存位置 + 文件名）
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: defaultName,
                        types: [{
                            description: 'JSON 文件',
                            accept: { 'application/json': ['.json'] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(json);
                    await writable.close();
                    _showImportExportNotice('导出成功', `已导出 ${hist.length} 条观看记录`, '📤', defaultName);
                    return;
                } catch (e) {
                    // 用户取消选择（AbortError）不提示；其它错误降级为传统下载
                    if (e && e.name === 'AbortError') return;
                    console.warn('[继续观看] 选择器导出失败，降级为传统下载：', e);
                }
            }
            // 降级方案：传统 <a download> 方式（自动下载到默认下载目录）
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            _showImportExportNotice('导出成功', `已导出 ${hist.length} 条观看记录`, '📤', defaultName);
        };

        // ★ 【优化二】导入观看记录：选择 JSON 文件，合并影片进度（更新时间更新的优先）
        //   导入完成后弹出精美结果弹窗
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = 'application/json,.json';
        importInput.style.display = 'none';
        document.body.appendChild(importInput);
        mask.querySelector('.hc-import').onclick = () => importInput.click();
        importInput.onchange = () => {
            const file = importInput.files && importInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(String(reader.result || ''));
                    const incoming = (data && Array.isArray(data.history)) ? data.history
                        : (Array.isArray(data) ? data : null);
                    if (!incoming) throw new Error('文件格式不正确');
                    const cur = loadHistory();
                    const map = {};
                    cur.forEach(h => { if (h && h.key) map[h.key] = h; });
                    let added = 0, updated = 0;
                    incoming.forEach(h => {
                        if (!h || !h.key) return;
                        const old = map[h.key];
                        const tNew = parseInt(h.updatedAt, 10) || 0;
                        const tOld = old ? (parseInt(old.updatedAt, 10) || 0) : 0;
                        if (!old) { map[h.key] = h; added++; }
                        else if (tNew >= tOld) { map[h.key] = h; updated++; }
                    });
                    const next = Object.values(map).sort((a, b) =>
                        (parseInt(b.updatedAt, 10) || 0) - (parseInt(a.updatedAt, 10) || 0));
                    saveHistory(next);
                    render();
                    // ★ 精美弹窗：导入成功
                    _showImportToast({ added: added, updated: updated, total: added + updated });
                } catch (e) {
                    // ★ 精美弹窗：导入失败
                    _showImportToast({ error: true, msg: '文件格式不正确或已损坏' });
                    console.warn('[继续观看] 导入失败', e);
                }
                importInput.value = '';
            };
            reader.readAsText(file);
        };

        // ---------- 通用提示弹窗（导出空态 / 清除成功 / 导出成功 共用）----------
        // 与导入/导出弹窗同一套 DOM 与样式，独立实例、点击任意位置关闭，
        // 不会被继续观看的遮罩层压住而看不见。
        function _showImportExportNotice(title, desc, icon, file) {
            _dismissImportExportToast();
            const t = document.createElement('div');
            t.id = 'hhkan-imp-exp-toast';
            const fileHtml = file
                ? `<div class="hie-file" title="${file}">📄 ${file}</div>`
                : '';
            t.innerHTML = `
            <div class="hie-toast">
                <div class="hie-ring"></div>
                <div class="hie-ring2"></div>
                <div class="hie-burst"></div>
                <div class="hie-confetti"></div>
                <div class="hie-icon">${icon || '✅'}</div>
                <div class="hie-title">${title || '提示'}</div>
                <div class="hie-desc">${desc || ''}</div>
                ${fileHtml}
                <div class="hie-tip">${file ? '文件已保存到您的下载目录' : '点击弹窗任意位置关闭'}</div>
            </div>`;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add('hie-show'));
            const dur = file ? 4500 : 3200;
            _toastTimer = setTimeout(() => {
                t.classList.remove('hie-show');
                setTimeout(() => t.remove(), 300);
            }, dur);
            t.onclick = () => { t.classList.remove('hie-show'); setTimeout(() => t.remove(), 300); };
        }

        // ---------- 导出成功精美弹窗 ----------
        function _showExportToast(count, fileName) {
            _dismissImportExportToast();
            const t = document.createElement('div');
            t.id = 'hhkan-imp-exp-toast';
            t.innerHTML = `
            <div class="hie-toast">
                <div class="hie-ring"></div>
                <div class="hie-ring2"></div>
                <div class="hie-burst"></div>
                <div class="hie-icon">📤</div>
                <div class="hie-title">导出成功</div>
                <div class="hie-desc">已成功导出 <b>${count}</b> 条观看记录</div>
                <div class="hie-file" title="${fileName}">📄 ${fileName}</div>
                <div class="hie-tip">文件已保存到您的下载目录</div>
            </div>`;
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add('hie-show'));
            _toastTimer = setTimeout(() => {
                t.classList.remove('hie-show');
                setTimeout(() => t.remove(), 300);
            }, 4000);
        }

        // ---------- 导入成功/失败精美弹窗 ----------
        function _showImportToast(res) {
            _dismissImportExportToast();
            const t = document.createElement('div');
            t.id = 'hhkan-imp-exp-toast';
            if (res.error) {
                t.innerHTML = `
                <div class="hie-toast hie-toast-err">
                    <div class="hie-icon">⚠️</div>
                    <div class="hie-title">导入失败</div>
                    <div class="hie-desc">${res.msg || '请检查文件格式'}</div>
                    <div class="hie-tip">支持「好好看」导出的 JSON 备份文件</div>
                </div>`;
            } else {
                t.innerHTML = `
                <div class="hie-toast">
                    <div class="hie-ring"></div>
                    <div class="hie-ring2"></div>
                    <div class="hie-burst"></div>
                    <div class="hie-confetti"></div>
                    <div class="hie-icon">📥</div>
                    <div class="hie-title">导入成功</div>
                    <div class="hie-desc">新增 <b>${res.added}</b> 条 · 更新 <b>${res.updated}</b> 条</div>
                    <div class="hie-tip">共 ${res.total} 条记录已合并到继续观看</div>
                </div>`;
            }
            document.body.appendChild(t);
            requestAnimationFrame(() => t.classList.add('hie-show'));
            const dur = res.error ? 3500 : 4500;
            _toastTimer = setTimeout(() => {
                t.classList.remove('hie-show');
                setTimeout(() => t.remove(), 300);
            }, dur);
        }

        // 关闭已存在的弹窗（避免重复）
        function _dismissImportExportToast() {
            const old = document.querySelector('#hhkan-imp-exp-toast');
            if (old) old.remove();
        }

        // ★ 二次确认：确定清除 / 我再想想（遮罩点击与 Esc 均等同「我再想想」）
        mask.querySelector('.hc-clearall').onclick = () => {
            (async () => {
                const hist = loadHistory();
                if (!hist.length) {
                    if (window.showFloatTip) window.showFloatTip('记录本就是空的');
                    return;
                }
                const ok = await hhkanConfirm({
                    title: '确认清空全部观看记录？',
                    desc: `即将删除全部 ${hist.length} 条继续观看记录，此操作不可恢复`
                });
                if (!ok) return;      // ★ 我再想想：什么都不做
                clearAllHistory();
                render();
                // ★ 用独立弹窗，避免被继续观看遮罩压住而看不见
                _showImportExportNotice('清除成功', '全部观看记录已清空', '🗑');
            })().catch(e => console.warn('[继续观看] 清空确认异常：', e));
        };
        mask.querySelector('.hc-close').onclick = () => mask.remove();
        mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    }


    // ====================================================================
    // ★★★ 开屏自动检测「当前影视是否更新了新一集」（v7 新增 · 免侵入挂载）
    // --------------------------------------------------------------------
    // 触发时机：打开 App 时（开屏动画期间）自动扫描继续观看列表里的「电视剧/动漫」，
    //   逐一抓取对应详情页比对最新 total 与上次 prevTotal：
    //     - total 变多 → 标记「更新了N集」（下次打开「继续观看」高亮红徽标）
    //     - 抓取失败/跨域受限 → 静默退化，沿用上次缓存的 total，不报错
    //   挂载方式：优先挂到 _splash.onProbeFinally（动画收尾时执行）；
    //   _splash 为 null（禁用/已播过）时由 startSplashUpdater() 兜底触发。
    //   完全不改动开屏动画 / 站点探测模块原有代码。
    // ====================================================================

    // 从观看历史条目还原影片 id（key 格式 'm:123'）
    function _movieIdFromHistory(h) {
        if (h && h.key && /^m:/i.test(h.key)) return h.key.replace(/^m:/i, '');
        const m = (h && h.url || '').match(/\/(?:movie|play|detail|tv|anime|variety|short)\/(\d+)/);
        return m ? m[1] : '';
    }

    /**
     * 抓取指定影片详情页，抽取「当前最新总集数」。
     * 返回 Promise<number>：成功返回总集数，失败/单集返回 0。
     * ★ 跟随自动切换：先打最优镜像，失败自动尝试其它候选（复用 fetchHhkanPoster 降级逻辑）。
     */
    function fetchDetailTotalEps(id) {
        return new Promise(function (resolve) {
            if (!id) { resolve(0); return; }
            var list = [hhkanHost()];
            if (typeof getHhkanCandidates === 'function') {
                try { getHhkanCandidates().forEach(function (h) {
                    var hs = (typeof _toHost==='function') ? _toHost(h) : h;
                    if (hs && hs !== list[0]) list.push(hs);
                }); } catch (e) { }
            }
            var tried = 0, done = false;
            function tryOne() {
                if (done) return;
                if (tried >= list.length) { resolve(0); return; }
                var base = (list[tried++] || '').replace(/\/+$/, '');
                var url = base + '/movie/' + encodeURIComponent(id) + '.html';
                try {
                    var xhr = new XMLHttpRequest();
                    xhr.timeout = 6000;
                    xhr.open('GET', url, true);
                    xhr.onload = function () {
                        if (xhr.status !== 200) { tryOne(); return; }
                        var html = xhr.responseText || '';
                        // 优先「共N集」（站点渲染，最权威）
                        var m = html.match(/共\s*(\d+)\s*集/);
                        var total = m ? (parseInt(m[1]) || 0) : 0;
                        if (total <= 0) {
                            // ★ v8 兜底1：JSON-LD 结构化数据（numberOfEpisodes）
                            var ldMatch = html.match(/"numberOfEpisodes"\s*:\s*"?(\d+)/i);
                            if (ldMatch) total = parseInt(ldMatch[1]) || 0;
                        }
                        if (total <= 0) {
                            // ★ v8 兜底2：og:type 为 tv_show 且页面有选集 → 至少 2 集
                            var ogType = html.match(/<meta\s+property="og:type"\s+content="([^"]+)"/i);
                            if (ogType && /tv|series|show/i.test(ogType[1])) {
                                // 统计 play-list 里的链接数
                                var cntAll = (html.match(/\/(?:play|movie)\/\d+\/\d+[^"']*/gi) || []).length;
                                if (cntAll > 1) total = cntAll;
                            }
                        }
                        if (total <= 0) {
                            // 兜底3：统计选集容器里的真实集数链接
                            var cnt = 0, seen = {};
                            var re = /href="([^"]*\/(?:play|movie)\/\d+\/\d+[^"]*)"/gi, mm;
                            while ((mm = re.exec(html)) !== null) { if (!seen[mm[1]]) { seen[mm[1]] = 1; cnt++; } }
                            total = cnt;
                        }
                        if (total <= 0) {
                            // 兜底4：解析「第N集」最大编号
                            var maxN = 0;
                            (html.match(/第\s*\d+\s*集/gi) || []).forEach(function (t) {
                                var n = parseInt((t.match(/\d+/) || [])[0]) || 0;
                                if (n > maxN) maxN = n;
                            });
                            total = maxN;
                        }
                        if (total <= 0) {
                            // ★ v8 兜底5：直接数 .module-play-list / .play-list 里的 a 标签数量
                            var listMatches = html.match(/<a[^>]+href="[^"]*"[^>]*>.*?第\s*\d+\s*集/gi) || [];
                            if (listMatches.length > 1) total = listMatches.length;
                        }
                        done = true;
                        resolve(total);
                    };
                    xhr.onerror = function () { tryOne(); };
                    xhr.ontimeout = function () { tryOne(); };
                    xhr.send();
                } catch (e) { tryOne(); }
            }
            tryOne();
        });
    }

    // 单条记录刷新：抓取最新 total，命中「更新了N集」则回传更新后的记录
    function _refreshOneHistory(h) {
        return new Promise(function (resolve) {
            var kind = h.kind || (parseInt(h.total) > 1 ? 'series' : 'movie');
            var id = _movieIdFromHistory(h);
            if (!id) { resolve(null); return; }

            // ★ v8：电影也参与检测（检测是否有新资源/新版本，不仅仅是集数变化）
            //   - series：比对 total（总集数）变化
            //   - movie：比对 updatedAt 与 lastCheckedAt，若详情页有变化则刷新元信息
            fetchDetailTotalEps(id).then(function (latest) {
                if (!latest || latest <= 0) { resolve(null); return; }
                var prevTotal = parseInt(h.prevTotal) || parseInt(h.total) || 0;
                var next = null;

                if (kind === 'series') {
                    // ★ 剧集：比对集数变化（核心逻辑，与 v7 一致）
                    if (latest > prevTotal) {
                        next = Object.assign({}, h, { total: latest, prevTotal: prevTotal, lastCheckedAt: Date.now() });
                    } else if (prevTotal === 0 && parseInt(h.total) > 0) {
                        next = Object.assign({}, h, { prevTotal: parseInt(h.total) || 0, lastCheckedAt: Date.now() });
                    }
                } else {
                    // ★ v8：电影/单集 —— 若 total 从 1 变为 >1，说明被重新分类为剧集，升级 kind
                    if (latest > 1) {
                        next = Object.assign({}, h, { kind: 'series', total: latest, prevTotal: prevTotal || 1, lastCheckedAt: Date.now() });
                        console.log('[开屏更新检测] 🎬 电影升级为剧集：', h.title, 'total=' + latest);
                    }
                    // ★ v8：电影也刷新海报/元信息（若之前没有海报，趁此补全）
                    else if (!h.poster || !h.category) {
                        // 触发一次异步补全（不阻塞当前 resolve）
                        _asyncFillMovieMeta(h);
                    }
                }
                resolve(next);
            }).catch(function () { resolve(null); });
        });
    }

    // ★ v8：异步补全电影元信息（海报/类型/年份），抓取详情页后写入 history
    function _asyncFillMovieMeta(h) {
        try {
            var id = _movieIdFromHistory(h);
            if (!id) return;
            var base = hhkanHost();
            var url = base.replace(/\/+$/, '') + '/movie/' + encodeURIComponent(id) + '.html';
            var xhr = new XMLHttpRequest();
            xhr.timeout = 6000;
            xhr.open('GET', url, true);
            xhr.onload = function () {
                if (xhr.status !== 200) return;
                var html = xhr.responseText || '';
                // 提取 og:image
                var poster = '';
                var ogMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
                if (ogMatch) poster = ogMatch[1];
                // 提取类型
                var category = '';
                var catMatch = html.match(/类型[：:]\s*([\u4e00-\u9fa5]{1,8}(?:[\/、][\u4e00-\u9fa5]{1,8}){0,3})/);
                if (catMatch) category = catMatch[1].trim().replace(/[\/、]/g, ', ');
                if (!poster && !category) return; // 无新信息则不更新
                // 更新 history 中对应条目
                try {
                    var hist = loadHistory();
                    var idx = hist.findIndex(function (x) { return x.key === h.key; });
                    if (idx >= 0) {
                        if (poster) hist[idx].poster = hist[idx].poster || poster;
                        if (category) hist[idx].category = hist[idx].category || category;
                        saveHistory(hist);
                        console.log('[开屏更新检测] ✅ 补全电影元信息：', h.title);
                    }
                } catch (e) { }
            };
            xhr.onerror = function () { };
            xhr.ontimeout = function () { };
            xhr.send();
        } catch (e) { }
    }

    // 开屏更新扫描：遍历继续观看列表，并发抓取并就地刷新
    function runSplashUpdateCheck() {
        try {
            // ★ 显示「正在检测更新」提示条（扫描结束自动移除）
            var scanTip = document.createElement('div');
            scanTip.id = 'hhkan-update-scan';
            scanTip.textContent = '🔍 正在检测影视更新…';
            try { document.body.appendChild(scanTip); } catch (e) { scanTip = null; }
            var hist = (typeof loadHistory==='function') ? loadHistory() : [];
            // ★ v8：扫描所有有 id 的记录（series 检测集数更新，movie 补全元信息）
            var targets = hist.filter(function (h) {
                return _movieIdFromHistory(h) && (h.kind === 'series' || h.kind === 'movie' || !h.kind);
            });
            var series = targets.filter(function (h) {
                var kind = h.kind || (parseInt(h.total) > 1 ? 'series' : 'movie');
                return kind === 'series';
            });
            var movies = targets.filter(function (h) {
                return (h.kind || 'movie') === 'movie';
            });
            if (!targets.length) {
                if (scanTip && scanTip.parentNode) { scanTip.textContent = '✅ 暂无观看记录'; setTimeout(function(){ scanTip.remove(); }, 1200); }
                return;
            }
            console.log('[开屏更新检测] 开始扫描 ' + series.length + ' 部剧集/动漫 + ' + movies.length + ' 部电影…');
            // ★ 限流：最多 3 个并发抓取，避免瞬间打满站点
            var LIMIT = 3, idx = 0, working = 0, changed = 0, doneCount = 0;
            var nextHist = hist.slice();
            function applyUpdate(updated) {
                if (!updated) return;
                var i = nextHist.findIndex(function (x) { return x.key === updated.key; });
                if (i < 0) return;
                var oldT = parseInt(nextHist[i].total) || 0;
                var newT = parseInt(updated.total) || 0;
                if (newT > oldT) {
                    updated.prevTotal = oldT || updated.prevTotal; // 保留「更新前」总集数，徽标 delta 才准确
                    nextHist[i] = Object.assign({}, nextHist[i], updated);
                    changed++;
                } else {
                    // ★ v8：即使 total 没变，也合并其它字段（poster/category 等补全）
                    nextHist[i] = Object.assign({}, nextHist[i], updated);
                }
            }
            function pump() {
                while (working < LIMIT && idx < targets.length) {
                    var item = targets[idx++];
                    working++;
                    (function (it) {
                        _refreshOneHistory(it).then(function (updated) {
                            applyUpdate(updated);
                            working--;
                            doneCount++;
                            if (idx >= targets.length && working === 0) finish();
                            else pump();
                        });
                    })(item);
                }
            }
            function finish() {
                if (scanTip && scanTip.parentNode) {
                    scanTip.textContent = changed ? ('🆕 ' + changed + ' 部作品已更新') : '✅ 暂无更新';
                    setTimeout(function () { if (scanTip && scanTip.parentNode) scanTip.remove(); }, 1500);
                }
                if (!changed && movies.length === 0) { console.log('[开屏更新检测] 无更新'); return; }
                if (typeof saveHistory==='function') saveHistory(nextHist);
                if (changed > 0) {
                    console.log('[开屏更新检测] ✅ ' + changed + ' 部作品已更新');
                    try { if (window.showFloatTip && changed > 0) window.showFloatTip(changed + ' 部追剧更新了新一集 🆕'); } catch (e) { }
                }
                // ★ 主动刷新「继续观看」弹窗（若已打开），让徽标即时可见
                try {
                    var list = document.getElementById('hhkan-continue-list');
                    if (list && typeof render==='function') render();
                } catch (e) { }
            }
            pump();
        } catch (e) {
            console.warn('[开屏更新检测] 异常：', e);
        }
    }

    // 挂载到开屏动画：探测收尾(onProbeFinally)时执行；_splash 为 null 时由启动流程兜底触发
    function startSplashUpdater() {
        if (typeof _splash !== 'undefined' && _splash && typeof _splash.onProbeFinally === 'function') {
            var orig = _splash.onProbeFinally || function () {};
            _splash.onProbeFinally = function () {
                try { orig(); } catch (e) { }
                runSplashUpdateCheck(); // ★ 动画收尾 → 仍在可见期内，立即扫描
            };
        } else {
            // ★ 弹窗禁用 / 本会话已播放过：无 onProbeFinally 可挂，直接兜底触发
            runSplashUpdateCheck();
        }
    }
    // 暴露给其它模块（选集弹窗打开时可手动触发一次精准核对）
    window.__hhkanCheckUpdates = runSplashUpdateCheck;
    // ★ 暴露给任务栏事件代理（函数在模块 IIFE 内，需显式挂到 window 中转）
    try{ (window.__hhkanActions = window.__hhkanActions || {}).continue = openContinueWatch; }catch(e){}

    // ---------- 注入任务栏按钮 ----------
    // ★ 说明：任务栏本体已在 buildUI() 的 topBar.innerHTML 中一次性完整生成
    //   （含 回退/前进/刷新/每日推荐/继续观看/全局设置/本地播放/置顶窗口/更新公告/删除APP），
    //   此处仅作「兜底校验」：若任务栏被外部 DOM 操作清空，则按统一清单重建，避免按钮丢失。
    //   ※ 单一数据源，调整按钮只改 buildUI 的 innerHTML，无需改动此处。
    const TOPBAR_BUTTONS = [
        { id:'btn-back',       label:'⬅️ 回退',     title:'返回上一页 (Alt+←)',       fn:()=>history.back() },
        { id:'btn-forward',    label:'➡️ 前进',     title:'前进到下一页 (Alt+→)',     fn:()=>history.forward() },
        { id:'btn-reload',     label:'🔄 刷新',     title:'刷新当前页 (Ctrl+R)',      fn:()=>location.reload() },
        { id:'btn-recommend',  label:'🎬 每日推荐', title:'每日影视推荐',             fn:()=>openRecommendModal() },
        { id:'btn-continue',   label:'⏯ 继续观看', title:'继续观看历史记录',           fn:()=>openContinueWatch() },
        { id:'btn-settings',   label:'⚙ 全局设置', title:'全局设置（快捷键/自动全屏/片尾续播）', fn:()=>openSettings() },
        { id:'btn-local-play', label:'📂 本地播放', title:'打开本地视频播放器',         fn:()=>openLocalPlayerModal() },
        { id:'btn-topmost',    label:'📌 置顶窗口', title:'窗口置顶（Pake 客户端可用）', fn:(e)=>toggleTopMost(e && e.target) },
        { id:'btn-notice',     label:'📋 更新公告', title:'查看本次更新公告',           fn:()=>showUpdateNotice() },

    ];
    function injectTopbarButtons() {
        const bar = document.querySelector('#pake-window-top-bar');
        if (!bar) return;
        // 已含全部按钮（按统一清单比对），无需重复注入
        if (bar.dataset.hhkanEnhanceInjected === '1') return;
        // 兜底：任务栏被清空时，按统一清单重建（保持分组结构）
        const hasAll = TOPBAR_BUTTONS.every(b => bar.querySelector('#' + b.id));
        if (hasAll) { bar.dataset.hhkanEnhanceInjected = '1'; return; }
        // 重建分组容器（保持与第一套 buildUI 完全一致的分组结构）
        bar.innerHTML = '';
        const groupDefs = [
            { cls:'tb-nav',  items: TOPBAR_BUTTONS.slice(0,3) },
            { cls:'tb-main', items: TOPBAR_BUTTONS.slice(3,8) },
            { cls:'tb-sys',  items: TOPBAR_BUTTONS.slice(8)  },
        ];
        const mkBtn = (b) => {
            const btn = document.createElement('button');
            btn.id = b.id; btn.type = 'button'; btn.textContent = b.label; btn.title = b.title;
            btn.style.pointerEvents = 'auto';
            btn.onclick = (e) => { e.stopPropagation(); b.fn(e); };
            return btn;
        };
        groupDefs.forEach(({cls, items}) => {
            const g = document.createElement('div');
            g.className = 'tb-group ' + cls;
            items.forEach(b => g.appendChild(mkBtn(b)));
            bar.appendChild(g);
        });
        bar.dataset.hhkanEnhanceInjected = '1';
    }

    // ---------- 样式 ----------
    function injectStyles() {
        if (document.querySelector('#hhkan-enhance-styles')) return;
        const s = document.createElement('style');
        s.id = 'hhkan-enhance-styles';
        s.textContent = `
        #hhkan-enhance-settings,#hhkan-continue-mask{position:fixed;inset:0;z-index:2147483640;
            background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:flex-end;padding:${BAR_H + 12}px 16px 16px;box-sizing:border-box;}
        #hhkan-continue-mask{justify-content:center;align-items:center;padding:${BAR_H + 12}px 12px 12px;}
        .hes-box,.hc-box{background:#fff;color:#222;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.4);
            animation:hesIn .25s cubic-bezier(.22,1,.36,1) forwards;max-height:80vh;display:flex;flex-direction:column;}
        .hes-box{width:440px;padding:18px 20px;}
        .hc-box{width:460px;padding:18px 20px;}
        @keyframes hesIn{from{opacity:0;transform:translateY(-30px) scale(.97);}to{opacity:1;transform:none;}}
        .hes-head,.hc-head{display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:bold;margin-bottom:12px;gap:8px;}
        .hes-close,.hc-close{background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:#888;}
        .hc-clearall{background:#fff0f0;color:#d33;border:1px solid #f5c6cb;border-radius:6px;font-size:12px;padding:4px 10px;cursor:pointer;}
        .hc-clearall:hover{background:#ffe3e3;}
        .hc-head-actions{display:inline-flex;align-items:center;gap:6px;}
        .hc-btn{background:#f2f2f7;color:#444;border:1px solid #ddd;border-radius:6px;font-size:12px;padding:4px 9px;cursor:pointer;transition:background .15s;}
        .hc-btn:hover{background:#e8e8f0;}
        [data-pp-theme="dark"] .hc-head-actions .hc-btn{ background:#24242e !important; color:#dcdce2 !important; border-color:#34344a !important; }
        [data-pp-theme="dark"] .hc-head-actions .hc-btn:hover{ background:#2e2e3c !important; }
        .hes-body{display:flex;flex-direction:column;gap:10px;overflow:auto;}
        .hes-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;}
        .hes-row input[type=number]{width:90px;padding:4px 6px;border:1px solid #ddd;border-radius:5px;}
        /* ★ 步长输入框容器：数值框 + 单位后缀一体成组，紧凑对齐（BUG 四） */
        .hes-num-wrap{display:inline-flex;align-items:stretch;flex:0 0 auto;}
        .hes-num-wrap input[type=number]{
            width:78px;padding:4px 8px;border:1px solid #ddd;border-right:none;
            border-radius:5px 0 0 5px;font-size:13px;color:#333;text-align:center;
        }
        .hes-num-wrap input[type=number]:focus{outline:none;border-color:#5b4bff;}
        .hes-num-unit{
            display:inline-flex;align-items:center;justify-content:center;
            padding:0 9px;font-size:12px;color:#777;background:#f2f2f7;
            border:1px solid #ddd;border-radius:0 5px 5px 0;user-select:none;
        }
        .hes-check{justify-content:space-between;}
        /* ★ 【优化二】步长输入框聚焦提示条：默认隐藏，聚焦时显示 */
        .hes-tip{
            display:none;
            align-items:center;gap:6px;
            margin:8px 0 2px 0;padding:8px 10px;
            background:#f0eeff;border:1px solid #d8d3ff;border-radius:7px;
            font-size:11.5px;color:#4a3fb0;line-height:1.5;
            animation: hesTipIn 0.2s ease forwards;
        }
        .hes-tip.hes-tip-show{ display:flex; }
        .hes-tip-icon{ font-size:13px; flex-shrink:0; }
        .hes-tip-text b{ color:#5b4bff; font-weight:700; }
        @keyframes hesTipIn{ from{opacity:0;transform:translateY(-4px);} to{opacity:1;transform:translateY(0);} }
        [data-pp-theme="dark"] .hes-tip{
            background:#1e1c34 !important; border-color:#3a3470 !important; color:#b8b0f0 !important;
        }
        [data-pp-theme="dark"] .hes-tip-text b{ color:#a29bfe !important; }
        /* ★ 功能项之间的下划线分隔线 */
        .hes-divider{height:1px;background:linear-gradient(90deg,transparent,#e0e0e8 20%,#e0e0e8 80%,transparent);margin:2px 0;}
        /* ★ 功能项图标：统一尺寸、居中对齐，与文字留有间距 */
        .hes-icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
            margin-right:8px;font-style:normal;font-size:14px;line-height:1;vertical-align:middle;}
        .hes-keymap{background:#f4f5fb;border:1px solid #e5e7f0;border-radius:10px;padding:12px 14px;font-size:12px;color:#444;line-height:1.65;}
        .hes-keymap-title{display:flex;align-items:center;gap:8px;font-weight:bold;color:#333;margin-bottom:10px;font-size:13px;}
        .hes-keymap-badge{font-size:10.5px;font-weight:600;color:#fff;background:linear-gradient(135deg,#6c5ce7,#a29bfe);padding:2px 9px;border-radius:20px;letter-spacing:0.3px;}
        .hes-keymap-sub{margin:8px 0 2px;font-size:11px;color:#666;}
        .hes-keymap-sub b,.hes-keymap b{color:#5b4bff;}
        .hes-keymap-table{width:100%;border-collapse:collapse;font-size:11.5px;margin:2px 0;}
        .hes-keymap-table th,.hes-keymap-table td{padding:8px 8px;text-align:left;vertical-align:middle;border-bottom:1px solid #e5e7f0;}
        .hes-keymap-table th{background:#ecedf7;color:#333;font-weight:bold;font-size:10.5px;text-transform:none;}
        .hes-keymap-table td{color:#444;}
        /* 斑马纹：奇偶行交替底色，更易区分 */
        .hes-keymap-table tbody tr:nth-child(even){background:rgba(255,255,255,0.7);}
        .hes-keymap-table tr:last-child td{border-bottom:none;}
        /* 图标列 */
        .hes-keymap-table .col-icon{width:26px;padding-right:0;text-align:center;font-size:13px;}
        .hes-keymap-table .col-func{font-weight:600;color:#333;white-space:nowrap;}
        .hes-keymap-table .col-key{white-space:nowrap;}
        .hes-keymap-table .col-desc{color:#666;line-height:1.5;}
        /* 按键徽标 <kbd>：模拟实体键盘按键，突出快捷键 */
        .hes-keymap kbd{display:inline-block;min-width:18px;padding:2px 7px;font-family:inherit;font-size:11px;font-weight:bold;color:#5b4bff;
            background:#fff;border:1px solid #cfd0e8;border-bottom:2px solid #b8b9d8;border-radius:5px;box-shadow:0 1px 0 rgba(0,0,0,0.05);text-align:center;}
        .hes-keymap .key-or{color:#999;font-size:10px;margin:0 2px;}
        .hes-keymap-sub kbd{display:inline-block;min-width:14px;padding:1px 6px;font-size:10.5px;font-weight:bold;color:#5b4bff;
            background:#fff;border:1px solid #cfd0e8;border-bottom:2px solid #b8b9d8;border-radius:4px;}
        .hes-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;}
        .hes-foot button{padding:6px 16px;border:none;border-radius:6px;cursor:pointer;font-size:13px;}
        .hes-save{background:#333;color:#fff;}.hes-reset{background:#eee;color:#333;}
        /* ★ 操作结果弹窗（保存 / 恢复默认 成功提示） */
        #hes-result-modal{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
            background:rgba(0,0,0,.5);animation:hesRMIn .2s ease forwards;}
        @keyframes hesRMIn{from{opacity:0;}to{opacity:1;}}
        .hes-result-box{width:300px;background:#fff;border-radius:14px;box-shadow:0 16px 56px rgba(0,0,0,.45);
            padding:26px 22px 18px;text-align:center;animation:hesRBIn .28s cubic-bezier(.22,1,.36,1) forwards;}
        @keyframes hesRBIn{from{opacity:0;transform:translateY(-24px) scale(.94);}to{opacity:1;transform:none;}}
        .hes-result-icon{font-size:42px;line-height:1;margin-bottom:10px;}
        .hes-result-title{font-size:17px;font-weight:bold;color:#222;margin-bottom:8px;}
        .hes-result-desc{font-size:12.5px;color:#666;line-height:1.55;margin-bottom:18px;}
        .hes-result-ok{width:100%;padding:9px 0;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;
            color:#fff;background:linear-gradient(135deg,#5b4bff,#7c6bff);transition:opacity .2s;}
        .hes-result-ok:hover{opacity:.9;}
        .hc-list{overflow:auto;display:flex;flex-direction:column;gap:8px;}
        .hc-item{display:flex;align-items:stretch;gap:8px;padding:0;border-radius:8px;background:#f6f6f8;overflow:hidden;}
        /* ★ v8：海报缩略图 */
        .hc-poster{flex:0 0 auto;width:56px;height:78px;border-radius:8px 0 0 8px;overflow:hidden;background:#e0e0e8;position:relative;}
        .hc-poster img{width:100%;height:100%;object-fit:cover;display:block;}
        .hc-poster-none{display:flex;align-items:center;justify-content:center;}
        .hc-poster-placeholder{font-size:22px;opacity:.5;}
        .hc-item-main{flex:1;min-width:0;padding:8px 12px;text-decoration:none;color:inherit;display:block;}
        .hc-item-main:hover{background:#ececf2;border-radius:8px;}
        .hc-del{flex:0 0 auto;align-self:center;background:#fff0f0;border:1px solid #f5c6cb;color:#d33;
            font-size:12px;line-height:1;cursor:pointer;padding:6px 12px;border-radius:6px;margin:0 10px;}
        .hc-del:hover{background:#ffe3e3;}
        .hc-title{font-size:14px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .hc-title .hc-update{display:inline-block;vertical-align:middle;margin-left:6px;padding:1px 6px;border-radius:5px;
            font-size:11px;font-weight:normal;color:#fff;background:linear-gradient(90deg,#ff6b6b,#ff8e53);}
        .hc-title .hc-update-done{background:linear-gradient(90deg,#2ecc71,#1abc9c);}
        /* ★ 集数比对徽标：更新了X集（高亮红，差值数字放大） / 更新至X集（静态灰） */
        .hc-title .hc-update-new{background:linear-gradient(90deg,#ff4757,#ff6b81);box-shadow:0 2px 8px rgba(255,71,87,.35);}
        .hc-title .hc-update-new b{font-size:13px;font-weight:bold;margin:0 1px;}
        .hc-title .hc-update-static{background:#9aa0ac;font-size:10.5px;}
        /* ★ v7：电影/类型小标签（仅电影/单集显示，剧集不显示） */
        .hc-title .hc-type-tag{display:inline-block;vertical-align:middle;margin-right:6px;padding:1px 6px;border-radius:5px;
            font-size:10.5px;font-weight:normal;color:#fff;background:linear-gradient(90deg,#5b4bff,#7c6bff);}
        /* ★ v7：开屏更新扫描进行中的提示条 */
        #hhkan-update-scan{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483645;
            background:rgba(0,0,0,.72);color:#fff;font-size:12px;padding:7px 16px;border-radius:20px;
            box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;animation:hhkanScanIn .25s ease;}
        @keyframes hhkanScanIn{from{opacity:0;transform:translate(-50%,8px);}to{opacity:1;transform:translate(-50%,0);}}
        .hc-meta{font-size:12px;color:#888;margin:4px 0;}
        .hc-bar{height:5px;background:#e2e2e8;border-radius:4px;overflow:hidden;}
        .hc-bar i{display:block;height:100%;background:linear-gradient(90deg,#7f5cff,#5ad6ff);}
        .hc-empty{padding:24px;text-align:center;color:#999;font-size:13px;}
        /* ==================== 导入/导出结果精美弹窗 ==================== */
        #hhkan-imp-exp-toast{
            position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;
            background:rgba(0,0,0,.5);backdrop-filter:blur(3px);
            opacity:0;transition:opacity .25s ease;pointer-events:none;
        }
        #hhkan-imp-exp-toast.hie-show{opacity:1;}
        .hie-toast{
            position:relative;width:340px;max-width:86vw;padding:28px 24px 22px;text-align:center;
            background:linear-gradient(160deg,#1e1e2e 0%,#232340 55%,#1a1a2e 100%);
            border:1px solid rgba(127,92,255,.35);border-radius:18px;
            box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 40px rgba(127,92,255,.12) inset;
            animation:hieIn .35s cubic-bezier(.22,1,.36,1) forwards;overflow:hidden;
        }
        @keyframes hieIn{from{opacity:0;transform:translateY(20px) scale(.94);}to{opacity:1;transform:none;}}
        .hie-toast-err{border-color:rgba(255,107,107,.4);background:linear-gradient(160deg,#2a1a1a 0%,#332020 55%,#221414 100%);}
        .hie-icon{
            font-size:42px;line-height:1;margin-bottom:12px;display:inline-block;
            animation:hieIconPop .5s cubic-bezier(.34,1.56,.64,1) .1s both;
        }
        @keyframes hieIconPop{from{transform:scale(0) rotate(-30deg);opacity:0;}to{transform:scale(1) rotate(0);opacity:1;}}
        .hie-title{font-size:19px;font-weight:700;color:#fff;margin-bottom:8px;letter-spacing:.5px;}
        .hie-desc{font-size:14px;color:#c8c8d8;margin-bottom:6px;}
        .hie-desc b{color:#7f5cff;font-weight:700;}
        .hie-toast-err .hie-desc b{color:#ff6b6b;}
        .hie-file{
            display:inline-block;max-width:100%;margin:10px auto 4px;padding:8px 14px;border-radius:8px;
            background:rgba(127,92,255,.12);border:1px solid rgba(127,92,255,.25);
            font-size:12px;color:#a89cd8;font-family:monospace;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .hie-tip{font-size:12px;color:#7a7a90;margin-top:8px;}
        /* 光圈装饰 */
        .hie-ring,.hie-ring2{
            position:absolute;border-radius:50%;border:2px solid transparent;
            animation:hieRing 1.2s ease-out forwards;pointer-events:none;
        }
        .hie-ring{top:50%;left:50%;width:60px;height:60px;margin:-30px 0 0 -30px;
            border-color:rgba(127,92,255,.6);}
        .hie-ring2{top:50%;left:50%;width:60px;height:60px;margin:-30px 0 0 -30px;
            border-color:rgba(90,214,255,.5);animation-delay:.2s;}
        @keyframes hieRing{from{transform:scale(.3);opacity:1;}to{transform:scale(3.5);opacity:0;}}
        .hie-burst{
            position:absolute;top:44%;left:50%;width:8px;height:8px;border-radius:50%;
            background:radial-gradient(circle,#7f5cff,#5ad6ff);
            animation:hieBurst .6s ease-out .05s forwards;transform:translate(-50%,-50%) scale(0);
            box-shadow:0 0 20px rgba(127,92,255,.6);pointer-events:none;
        }
        @keyframes hieBurst{from{transform:translate(-50%,-50%) scale(0);opacity:1;}
            to{transform:translate(-50%,-50%) scale(12);opacity:0;}}
        /* 彩色纸屑粒子 */
        .hie-confetti{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
        .hie-confetti span{
            position:absolute;top:44%;left:50%;border-radius:2px;opacity:0;
            --tx:0px;--ty:0px;
            animation:hieConfetti 1s cubic-bezier(.22,.7,.35,1) forwards;
        }
        @keyframes hieConfetti{
            from{opacity:1;transform:translate(0,0) rotate(0deg) scale(1);}
            to{opacity:0;transform:translate(var(--tx),var(--ty)) rotate(540deg) scale(.3);}
        }
        /* 白天模式适配 */
        [data-pp-theme="light"] #hhkan-imp-exp-toast .hie-toast{
            background:linear-gradient(160deg,#ffffff 0%,#f5f5fb 55%,#eef0fa 100%);
            border-color:rgba(127,92,255,.3);
            box-shadow:0 20px 60px rgba(0,0,0,.18),0 0 40px rgba(127,92,255,.06) inset;
        }
        [data-pp-theme="light"] .hie-title{color:#1a1a2e;}
        [data-pp-theme="light"] .hie-desc{color:#4a4a5a;}
        [data-pp-theme="light"] .hie-tip{color:#8a8a9a;}
        [data-pp-theme="light"] .hie-toast-err{
            background:linear-gradient(160deg,#fff5f5 0%,#ffe8e8 55%,#ffe0e0 100%);
            border-color:rgba(255,107,107,.35);
        }
        `;
        document.head.appendChild(s);
    }

    // ---------- 初始化 ----------
    function init() {
        injectStyles();
        injectTopbarButtons();
        watchForVideo();
    }
    document.addEventListener('keydown', applyKey);
    // 视频动态出现时绑定 + 持续注入任务栏按钮
    const mo = new MutationObserver(() => { watchForVideo(); injectTopbarButtons(); });
    mo.observe(document.body, { childList: true, subtree: true });
    setInterval(injectTopbarButtons, 3000);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
})();
});/* ============================================================
/* ============================================================
 * 好好看 · 补丁 v7 —— 返回顶部按钮
 * 功能：圆形悬浮按钮，下滑到指定高度后淡入显示；鼠标悬停时
 *       弹出「返回顶部」文字气泡，点击平滑回到顶部；
 *       位于屏幕右下角，自适应布局（跟随视口、避开全屏/安全区）。
 * 依赖：无（纯全局 IIFE，不调用任何内部函数，可独立开关）
 *
 * ★★★ 位置强制策略（不可改）：★★★
 *   1. 无论 CFG 怎么改，最终定位永远是「视口右下角」，right/bottom 距离
 *      由 LOCK_RIGHT / LOCK_BOTTOM 统一计算，不接受任何其它定位值；
 *   2. 站点 CSS / 父元素 transform、filter、perspective 都可能让
 *      position:fixed 失效或漂移，故强制清除祖先干扰样式，并把自身提到
 *      document.documentElement 下（脱离污染子树）；
 *   3. 任何时刻（resize、全屏切换、滚动容器切换、DOM 重排、双击复位）
 *      都会重新执行 enforceRightBottom()，杜绝中途跑偏；
 *   4. 位置缓存（POS_KEY）永远为空，双击复位永远回到右下角。
 * ============================================================ */
(function () {
    'use strict';
    // ================== ★ 配置（改这里即可）==================
    const CFG = {
        SHOW_AFTER: 400,        // 下滑超过此像素（window 滚动）后出现按钮
        Z_INDEX: 2147483600,    // 层级，低于弹窗/遮罩，高于普通内容
        DRAGGABLE: false,       // ★ 永远 false —— 按钮不可移动，右下角锁死
        RIGHT: 20,              // ★ 距右边缘距离（px），最小 16，防贴死边
        BOTTOM: 90,             // ★ 距底边缘距离（px），最小 16，避让手势区
        SNAP_TO_EDGE: false,    // 已废弃，永远不吸附其它边缘
        SNAP_THRESHOLD: 40,     // 已废弃
        RESUME_DURATION: 0,     // ★ 0 = 永不恢复（右下角本身就是最终位）
        SCROLL_DURATION: 500,  // 点击后滚动动画时长（ms），0 = 瞬时
        TIP_TEXT: '返回顶部',   // 鼠标悬停弹出的文字
        POS_KEY: 'hhkan_back2top_pos',  // 保留键名仅用于清空旧缓存，不再写入
    };
    // ★ 右下角硬约束：这两个值任何代码路径都不能被覆盖
    const LOCK_RIGHT  = Math.max(16, CFG.RIGHT);   // 最小 16px，防止贴死屏幕边
    const LOCK_BOTTOM = Math.max(16, CFG.BOTTOM);  // 最小 16px，避让系统手势区
    // =========================================================

    let btn, rafId = 0, visible = false;
    // ★ pos 永远为 null —— 不存在"用户自定义位置"这个概念
    let pos = null;
    let dragging = false;
    let resumeTimer = 0;
    // 已清掉的祖先干扰样式（运行时记录，仅用于调试与幂等清理）
    let fixedAncestorCleared = false;

    // ★★ 强制右下角：唯一可信的定位出口 ★★
    //   - 只写 right/bottom，绝不给 left/top 赋值（避免 left 残留盖掉 right）；
    //   - transform 归零：父级 transform 会让 fixed 参照祖先而非视口；
    //   - bottom 用 calc 叠加安全区，移动端避让手势条/地址栏；
    //   - 绝不写 visibility：显隐完全由 CSS 的 .b2t-show 控制，inline 写
    //     visibility 会盖掉 CSS 的 visibility:visible，导致滚动到位也不显示。
    function enforceRightBottom() {
        if (!btn) return;
        const right = 'calc(' + LOCK_RIGHT + 'px + env(safe-area-inset-right, 0px))';
        const bottom = 'calc(' + LOCK_BOTTOM + 'px + env(safe-area-inset-bottom, 0px))';
        btn.style.left = 'auto';
        btn.style.top = 'auto';
        btn.style.right = right;
        btn.style.bottom = bottom;
        btn.style.position = 'fixed';
        btn.style.transform = 'none';
        btn.style.margin = '0';
    }

    // ★ 清掉会让 position:fixed 失效的祖先样式
    //   父/祖先若有 transform / filter / perspective / will-change:transform，
    //   fixed 子元素会改为参照该祖先而非视口，按钮就跑偏了。
    function neutralizeAncestorTransform() {
        if (fixedAncestorCleared) return;
        let el = btn ? btn.parentElement : null;
        const cleared = [];
        while (el && el !== document.documentElement) {
            const cs = window.getComputedStyle(el);
            if ((cs.transform && cs.transform !== 'none') ||
                (cs.filter && cs.filter !== 'none') ||
                (cs.perspective && cs.perspective !== 'none' && cs.perspective !== '0px') ||
                cs.willChange === 'transform') {
                // 记录原始值，便于恢复（尽管本场景无需恢复）
                el.setAttribute('data-b2t-restore-transform', el.style.transform || '');
                el.setAttribute('data-b2t-restore-filter', el.style.filter || '');
                el.setAttribute('data-b2t-restore-perspective', el.style.perspective || '');
                el.setAttribute('data-b2t-restore-willchange', el.style.willChange || '');
                el.style.transform = 'none';
                el.style.filter = 'none';
                el.style.perspective = 'none';
                el.style.willChange = 'auto';
                cleared.push(el.tagName + (el.id ? '#' + el.id : ''));
            }
            el = el.parentElement;
        }
        if (cleared.length) {
            fixedAncestorCleared = true;
            console.log('[返回顶部] 已清除祖先干扰样式:', cleared.join(', '));
        }
    }

    // 已废弃：位置持久化全部禁用，缓存键不再写入（保留函数体为空，避免外部引用报错）
    function loadPos()  { return null; }
    function savePos()  { /* 不缓存任何位置，按钮永远在右下角 */ }
    function clearPos() {
        try { localStorage.removeItem(CFG.POS_KEY); } catch (e) { /* 忽略 */ }
    }

    function injectStyles() {
        if (document.querySelector('#hhkan-back2top-styles')) return;
        const st = document.createElement('style');
        st.id = 'hhkan-back2top-styles';
        st.textContent = '\n        /* ★ 圆形返回顶部按钮（强制右下角，不可移动，不可覆盖） */\n        #hhkan-back2top {\n            /* ---- 定位：fixed + 右下角，唯一可信锚点 ---- */\n            position: fixed !important;\n            right: calc(' + LOCK_RIGHT + 'px + env(safe-area-inset-right, 0px)) !important;\n            bottom: calc(' + LOCK_BOTTOM + 'px + env(safe-area-inset-bottom, 0px)) !important;\n            left: auto !important;\n            top: auto !important;\n            /* ---- 外观 ---- */\n            width: 46px;\n            height: 46px;\n            border-radius: 50%;\n            border: none;\n            padding: 0;\n            margin: 0;\n            z-index: ' + CFG.Z_INDEX + ';\n            cursor: pointer;\n            display: flex;\n            align-items: center;\n            justify-content: center;\n            background: linear-gradient(135deg, #5b4bff 0%, #8a7bff 100%);\n            box-shadow: 0 6px 18px rgba(91, 75, 255, 0.35),\n                        inset 0 1px 2px rgba(255, 255, 255, 0.35);\n            color: #fff;\n            opacity: 0;\n            transform: scale(0.6);\n            visibility: hidden;\n            /* 过渡里绝不出现 left/top/right/bottom，避免动画过程偏移 */\n            transition: opacity .25s ease, transform .25s cubic-bezier(.22,1,.36,1),\n                        box-shadow .2s ease, background .2s ease;\n            -webkit-tap-highlight-color: transparent;\n            touch-action: none;\n        }\n        /* ★ 任何状态下都不得把按钮改成 absolute 或挪到其它角 */\n        html > #hhkan-back2top {\n            position: fixed !important;\n            right: calc(' + LOCK_RIGHT + 'px + env(safe-area-inset-right, 0px)) !important;\n            bottom: calc(' + LOCK_BOTTOM + 'px + env(safe-area-inset-bottom, 0px)) !important;\n            left: auto !important;\n            top: auto !important;\n        }\n        /* ★ 显示态：只管显隐，不碰定位 */\n        #hhkan-back2top.b2t-show {\n            opacity: 1;\n            transform: scale(1);\n            visibility: visible;\n        }\n        #hhkan-back2top:hover {\n            background: linear-gradient(135deg, #4a3dee 0%, #7c6bff 100%);\n            box-shadow: 0 8px 24px rgba(91, 75, 255, 0.5),\n                        inset 0 1px 2px rgba(255, 255, 255, 0.4);\n        }\n        #hhkan-back2top:active { transform: scale(0.92); }\n        /* ★ 拖动期间：关掉位移过渡，避免跟手滞后；光标改 grabbing */\n        #hhkan-back2top.b2t-dragging {\n            transition: opacity .25s ease, transform .25s cubic-bezier(.22,1,.36,1),\n                        box-shadow .2s ease, background .2s ease;\n            cursor: grabbing;\n            box-shadow: 0 12px 30px rgba(91, 75, 255, 0.55),\n                        inset 0 1px 2px rgba(255, 255, 255, 0.4);\n        }\n        /* ★ 拖动到位时弹一下反馈（结束后立刻复位回右下角） */\n        #hhkan-back2top.b2t-snap {\n            animation: b2tSnap .35s ease;\n        }\n        @keyframes b2tSnap {\n            0%   { transform: scale(1); }\n            40%  { transform: scale(1.12); }\n            100% { transform: scale(1); }\n        }\n        /* ★ 箭头：纯 CSS 向上箭头，不依赖图标字体 */\n        #hhkan-back2top .b2t-arrow {\n            width: 13px;\n            height: 13px;\n            border-left: 3px solid #fff;\n            border-top: 3px solid #fff;\n            border-radius: 2px;\n            transform: rotate(45deg) translate(1px, 1px);\n            margin-top: 5px;\n            pointer-events: none;\n        }\n        /* ★ 悬停文字气泡（位于按钮左侧，朝右指向按钮） */\n        #hhkan-back2top .b2t-tip {\n            position: absolute;\n            right: 56px;\n            top: 50%;\n            transform: translateY(-50%) translateX(6px);\n            background: rgba(20, 20, 30, 0.92);\n            color: #fff;\n            font-size: 12.5px;\n            line-height: 1.4;\n            white-space: nowrap;\n            padding: 6px 11px;\n            border-radius: 8px;\n            pointer-events: none;\n            opacity: 0;\n            visibility: hidden;\n            transition: opacity .18s ease, transform .18s ease;\n            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);\n        }\n        #hhkan-back2top .b2t-tip::after {\n            content: "";\n            position: absolute;\n            right: -5px;\n            top: 50%;\n            transform: translateY(-50%);\n            border: 5px solid transparent;\n            border-left-color: rgba(20, 20, 30, 0.92);\n        }\n        #hhkan-back2top:hover .b2t-tip,\n        #hhkan-back2top:focus-visible .b2t-tip {\n            opacity: 1;\n            visibility: visible;\n            transform: translateY(-50%) translateX(0);\n        }\n        /* ★ 全屏播放时隐藏，避免遮挡控件 */\n        :fullscreen ~ #hhkan-back2top,\n        *:fullscreen #hhkan-back2top { display: none; }\n        /* ★ 窄屏自适应：窗口不足以容纳「按钮+气泡」时隐藏气泡 */\n        @media (max-width: 520px) {\n            #hhkan-back2top .b2t-tip { display: none; }\n        }\n        /* ★ 超窄屏/横屏自动收紧右下角距离，但绝不改变"右下角" */\n        @media (max-width: 380px), (orientation: landscape) and (max-height: 420px) {\n            #hhkan-back2top {\n                right: calc(12px + env(safe-area-inset-right, 0px)) !important;\n                bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;\n            }\n        }\n        ';
        (document.head || document.documentElement).appendChild(st);
    }

    // 获取真实滚动距离（兼容各站点滚动容器差异）
    function getScrollTop() {
        return window.pageYOffset
            || document.documentElement.scrollTop
            || document.body.scrollTop
            || 0;
    }

    // 带缓动的平滑滚动（不依赖 scroll-behavior，避免被站点覆盖）
    function smoothScrollTo(targetY, duration) {
        const startY = getScrollTop();
        const diff = targetY - startY;
        if (diff === 0 || duration <= 0) {
            window.scrollTo(0, targetY);
            return;
        }
        const startTime = performance.now();
        function step(now) {
            let t = Math.min((now - startTime) / duration, 1);
            // easeInOutCubic
            t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            window.scrollTo(0, startY + diff * t);
            if (t < 1) rafId = requestAnimationFrame(step);
        }
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(step);
    }

    // 根据滚动位置切换显隐
    function updateVisibility() {
        if (!btn) return;
        const st = getScrollTop();
        const shouldShow = st > CFG.SHOW_AFTER;
        if (shouldShow !== visible) {
            visible = shouldShow;
            btn.classList.toggle('b2t-show', visible);
        }
        // ★ 兜底：若站点脚本给按钮设了 display:none，滚动到位时强制解除
        //   （仅在应显示时处理，避免把隐藏态按钮强行露出）
        if (shouldShow && btn.style.display === 'none') {
            btn.style.display = '';
        }
    }

    // 滚动监听（rAF 节流，性能友好）
    let ticking = false;
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            updateVisibility();
            ticking = false;
        });
    }

    // ---- 拖动控制 ----
    // ★ 注：DRAGGABLE 为 false，startDrag 永远返回 false，按钮不可拖动。
    //   即使将来把 DRAGGABLE 改成 true，moveDrag/endDrag 也会在每次位移后
    //   立刻把按钮拉回右下角，最终行为仍是"钉死右下角"。
    function startDrag(clientX, clientY, fromTouch) {
        if (!CFG.DRAGGABLE || dragging) return false;
        dragging = true;
        btn.classList.add('b2t-dragging');
        // 起点永远取当前右下角位置，不读 getBoundingClientRect（避免被偏移污染）
        const rect = btn.getBoundingClientRect();
        btn._dragOffset = {
            x: clientX - rect.left,
            y: clientY - rect.top,
            fromTouch: !!fromTouch,
            moved: false,
        };
        // ★ 拖动中每帧归位右下角，视觉上按钮纹丝不动，只能触发"返回顶部"
        enforceRightBottom();
        if (CFG.RESME_DURATION) {
            clearTimeout(resumeTimer);
        }
        return true;
    }

    function moveDrag(clientX, clientY) {
        if (!dragging || !btn._dragOffset) return;
        const o = btn._dragOffset;
        const x = clientX - o.x;
        const y = clientY - o.y;
        // ★ 无论拖多远，立刻归位右下角，并记录为已移动（松手即回到顶部）
        o.moved = true;
        enforceRightBottom();
    }

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        btn.classList.remove('b2t-dragging');
        const o = btn._dragOffset || { moved: false };
        // ★ 无论如何都回到右下角（本次未移动也归位，保证万无一失）
        enforceRightBottom();
        // 弹一下反馈再归位
        btn.classList.remove('b2t-snap');
        void btn.offsetWidth;
        btn.classList.add('b2t-snap');
        pos = null;
        // 拖动过 → 触发返回顶部；未拖动 → 留给 click 处理
        if (o.moved) {
            cancelAnimationFrame(rafId);
            smoothScrollTo(0, CFG.SCROLL_DURATION);
        }
    }

    function build() {
        btn = document.createElement('button');
        btn.id = 'hhkan-back2top';
        btn.type = 'button';
        btn.title = CFG.TIP_TEXT;
        btn.setAttribute('aria-label', CFG.TIP_TEXT);
        btn.innerHTML =
            '<span class="b2t-arrow" aria-hidden="true"></span>' +
            '<span class="b2t-tip">' + CFG.TIP_TEXT + '</span>';
        // ★ 追加到 documentElement（根级），脱离 body 内可能被 transform 污染的子树
        if (document.documentElement) {
            document.documentElement.appendChild(btn);
        } else {
            (document.body || document.documentElement).appendChild(btn);
        }
        // ★ 立刻锁定右下角，并把位置缓存里的脏数据清掉
        clearPos();
        enforceRightBottom();
        neutralizeAncestorTransform();

        // ---- 鼠标按下：即便 DRAGGABLE 为 false，也要防住浏览器自带的拖拽选中 ----
        btn.addEventListener('mousedown', function (e) {
            if (e.button !== 0) return;
            enforceRightBottom();
            if (startDrag(e.clientX, e.clientY, false)) {
                e.preventDefault();
            }
        });
        window.addEventListener('mousemove', function (e) {
            if (dragging) {
                moveDrag(e.clientX, e.clientY);
                e.preventDefault();
            }
        });
        window.addEventListener('mouseup', function () {
            if (dragging) endDrag();
        });

        // ---- 触摸拖动（移动端）----
        btn.addEventListener('touchstart', function (e) {
            const t = e.touches[0];
            if (!t) return;
            enforceRightBottom();
            startDrag(t.clientX, t.clientY, true);
        }, { passive: true });
        btn.addEventListener('touchmove', function (e) {
            if (!dragging) {
                // 未进入拖动态时也强制归位（防站点脚本改样式）
                enforceRightBottom();
                return;
            }
            const t = e.touches[0];
            if (!t) return;
            // 小于 6px 的抖动仍当点击处理，但位置始终锁定
            const o = btn._dragOffset;
            if (o && !o.moved) {
                const rect = btn.getBoundingClientRect();
                if (Math.abs(t.clientX - rect.left - o.x) < 6 &&
                    Math.abs(t.clientY - rect.top - o.y) < 6) {
                    enforceRightBottom();
                    return;
                }
                o.moved = true;
            }
            moveDrag(t.clientX, t.clientY);
            e.preventDefault();
        }, { passive: false });
        btn.addEventListener('touchend', function (e) {
            if (dragging) {
                endDrag();
                btn.blur();
                if (e.cancelable) e.preventDefault();
            }
            // ★ 松手后无论如何都锁死右下角
            enforceRightBottom();
        }, { passive: false });
        btn.addEventListener('touchcancel', function () {
            if (dragging) endDrag();
            enforceRightBottom();
        });

        // ---- 单击返回顶部（拖动情况下会被 endDrag 拦掉）----
        btn.addEventListener('click', function (e) {
            if (btn._dragOffset && btn._dragOffset.moved) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            cancelAnimationFrame(rafId);
            smoothScrollTo(0, CFG.SCROLL_DURATION);
            enforceRightBottom();
        });

        // ---- 双击复位到默认右下角（兜底，本就是右下角）----
        btn.addEventListener('dblclick', function (e) {
            e.preventDefault();
            pos = null;
            clearPos();
            enforceRightBottom();
            btn.classList.remove('b2t-snap');
            void btn.offsetWidth;
            btn.classList.add('b2t-snap');
            if (typeof window.showFloatTip === 'function') {
                window.showFloatTip('返回顶部按钮已锁定在右下角');
            }
        });

        // ---- 初始化位置：永远右下角，不读缓存 ----
        enforceRightBottom();
        updateVisibility();
    }

    // ★ 滚动容器变化时重新校准（单页应用切换路由 / 播放器内嵌滚动时触发）
    function onScrollContainerChange() {
        neutralizeAncestorTransform();
        enforceRightBottom();
        updateVisibility();
    }

    function init() {
        if (document.querySelector('#hhkan-back2top')) return;
        injectStyles();
        build();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', function () {
            onScroll();
            // resize 必然触发视口右下角变化，重算 right/bottom
            enforceRightBottom();
        }, { passive: true });
        // ★ orientationchange：移动端横竖屏切换，安全区 inset 会变
        window.addEventListener('orientationchange', function () {
            setTimeout(enforceRightBottom, 100);
            setTimeout(enforceRightBottom, 400);
        });
        // ★ 全屏切换：退出全屏后重新归位
        document.addEventListener('fullscreenchange', function () {
            setTimeout(enforceRightBottom, 50);
            updateVisibility();
        });
        // ★ DOM 变动守卫：只监听 style 属性，不监听 class。
        //   class 频繁切换（b2t-show 显隐）会高频触发回调，回调里若误写
        //   visibility 反而把按钮重新藏起来。style 只在被外部脚本篡改时变动。
        if (window.MutationObserver) {
            let correcting = false; // 防自循环：自己纠正自己时不再进回调
            const mo = new MutationObserver(function (records) {
                if (correcting) return;
                let needFix = false;
                for (let i = 0; i < records.length; i++) {
                    const r = records[i];
                    // 只关心 style 变化，且必须是目标按钮自身
                    if (r.type === 'attributes' && r.attributeName === 'style' && r.target === btn) {
                        const st = btn.style;
                        // 只有被改成非锁定值才纠正；空字符串/auto 都是正常值
                        if ((st.left && st.left !== 'auto') ||
                            (st.top && st.top !== 'auto') ||
                            (st.position && st.position !== 'fixed') ||
                            (st.right && st.right !== btn._lockedRight) ||
                            (st.bottom && st.bottom !== btn._lockedBottom)) {
                            needFix = true;
                        }
                        break;
                    }
                }
                if (needFix) {
                    correcting = true;
                    enforceRightBottom();
                    correcting = false;
                }
            });
            // 等待 build 完成后再观察（按钮已挂载）
            setTimeout(function () {
                if (!btn) return;
                // 记录当前锁定值，用于判定 right/bottom 是否被改
                btn._lockedRight = 'calc(' + LOCK_RIGHT + 'px + env(safe-area-inset-right, 0px))';
                btn._lockedBottom = 'calc(' + LOCK_BOTTOM + 'px + env(safe-area-inset-bottom, 0px))';
                mo.observe(document.documentElement, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style'],
                });
            }, 0);
            // ★ 全局兜底：每 3 秒校准定位（只重写定位相关样式，不动显隐）
            setInterval(enforceRightBottom, 3000);
        }
    }

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();


/* ============================================================
 * 好好看 · 补丁 v6
 * 功能 ①：选集弹窗注入搜索框（输入集数 → 回车跳转并自动全屏）
 * 功能 ②：修复 BUG —— 全屏播放时选集弹窗 UI 仍带搜索框
 *            （监听全屏变化 + fsEl 子树，弹窗被移入全屏后补注入）
 * 设计原则：纯全局 IIFE；仅通过 DOM + sessionStorage + 已暴露的
 *           window.gotoNextEpisode 协作；不调用未暴露的内部函数。
 * ============================================================ */
(function () {
    'use strict';
    const PF_PREFIX = 'pf6-';
    const STYLE_ID = PF_PREFIX + 'patch-styles';
    const AUTO_FS_KEY = 'hhkan_auto_fullscreen'; // 与原脚本 AUTO_FS_KEY 同名约定

    /* ---------- 日志 / 提示（降级兼容） ---------- */
    function log(m) { console.log('[补丁v6] ' + m); }
    function tip(text) {
        if (typeof window.showFloatTip === 'function') { window.showFloatTip(text); return; }
        let t = document.querySelector('#pf6-toast');
        if (!t) { t = document.createElement('div'); t.id = 'pf6-toast';
            t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(0,0,0,.82);color:#fff;padding:8px 16px;border-radius:8px;font-size:14px;pointer-events:none;';
            document.body.appendChild(t); }
        t.textContent = text; t.style.opacity = '1';
        clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 1800);
    }

    /* ---------- 是否已注入搜索框 ---------- */
    function hasSearchBox(mask) { return !!(mask && mask.querySelector('.' + PF_PREFIX + 'ep-search')); }

    /* ---------- 解析用户输入为集数数字 ---------- */
    function parseNum(q) {
        if (!q) return null;
        const m = String(q).trim().match(/^第?(\d+)集?$/);
        return m ? parseInt(m[1], 10) : null;
    }

    /* ---------- 取当前可见的线路面板 ---------- */
    function getActivePanel(mask) {
        if (!mask) return null;
        return mask.querySelector('.ep-line-panel:not([style*="display:none"])') || mask.querySelector('.ep-line-panel');
    }

    /* ---------- 注入搜索框 ---------- */
    function injectEpSearch(mask) {
        if (!mask || hasSearchBox(mask)) return;
        const header = mask.querySelector('.ep-header');
        if (!header) return; // 弹窗结构异常，放弃
        const wrap = document.createElement('div');
        wrap.className = PF_PREFIX + 'ep-search';
        wrap.innerHTML =
            '<input class="' + PF_PREFIX + 'ep-search-input" type="text" placeholder="🔍 输入集数(如 23) 回车跳转并全屏" inputmode="numeric" autocomplete="off">' +
            '<span class="' + PF_PREFIX + 'ep-search-hit"></span>' +
            '<button class="' + PF_PREFIX + 'ep-search-clear" type="button" title="清空">✕</button>';
        header.insertAdjacentElement('afterend', wrap);
        const input = wrap.querySelector('.' + PF_PREFIX + 'ep-search-input');
        const hit = wrap.querySelector('.' + PF_PREFIX + 'ep-search-hit');
        const clearBtn = wrap.querySelector('.' + PF_PREFIX + 'ep-search-clear');

        const updateHit = function () {
            const panel = getActivePanel(mask);
            if (!panel) { hit.textContent = ''; return; }
            const total = panel.querySelectorAll('.ep-item').length;
            const num = parseNum(input.value);
            if (num == null) { hit.textContent = '共 ' + total + ' 集'; return; }
            const item = panel.querySelector('.ep-item[data-num="' + num + '"]');
            hit.textContent = item ? '命中：第' + num + '集 ✓' : '未找到第' + num + '集';
        };

        const doJump = function (num) {
            const panel = getActivePanel(mask);
            if (!panel) return false;
            const item = panel.querySelector('.ep-item[data-num="' + num + '"]');
            if (!item) { tip('未找到第 ' + num + ' 集'); return false; }
            tip('正在跳转到第 ' + num + ' 集…');
            // 设置自动全屏标志：跳转后原脚本 tryAutoFullscreen 会接管进入全屏
            try { sessionStorage.setItem(AUTO_FS_KEY, '1'); } catch (e) {}
            // 触发原生点击（与原 .ep-item 点击行为一致）
            try { item.click(); } catch (e) { location.href = item.getAttribute('href'); }
            // 关闭选集弹窗
            try { mask.remove(); } catch (e) {}
            return true;
        };

        input.addEventListener('input', updateHit);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const num = parseNum(input.value);
                if (num == null) { tip('请输入集数，如 23'); return; }
                doJump(num);
            } else if (e.key === 'Escape') {
                input.value = ''; updateHit();
            }
        });
        clearBtn.addEventListener('click', function () { input.value = ''; updateHit(); input.focus(); });
        setTimeout(updateHit, 0);
        log('选集搜索框已注入（共 ' + (getActivePanel(mask).querySelectorAll('.ep-item').length) + ' 集）');
    }

    /* ---------- 监听弹窗出现：body 子节点 + 全屏元素子树 ---------- */
    function watchEpisodeModal() {
        var processed = new WeakSet();
        var obs = new MutationObserver(function () {
            var mask = document.querySelector('#episode-modal-mask');
            if (mask && !processed.has(mask)) {
                processed.add(mask);
                injectEpSearch(mask);
            }
        });
        // 监听 body 直接子节点变化（弹窗通常 append 到 body）
        obs.observe(document.body, { childList: true, subtree: false });
        // 若弹窗已存在（首次加载即出现），立即注入
        var exist = document.querySelector('#episode-modal-mask');
        if (exist) { processed.add(exist); injectEpSearch(exist); }
        // 全屏时弹窗可能被移入 fsEl；监听全屏元素子树，补注入
        var fsHandler = function () {
            var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (!fsEl) return;
            var mask = fsEl.querySelector('#episode-modal-mask');
            if (mask) injectEpSearch(mask);
        };
        document.addEventListener('fullscreenchange', fsHandler);
        document.addEventListener('webkitfullscreenchange', fsHandler);
        document.addEventListener('mozfullscreenchange', fsHandler);
        // 对全屏元素本身也做子树监听（弹窗 append 进 fsEl 时触发）
        var fsObs = new MutationObserver(function () {
            var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (!fsEl) return;
            var mask = fsEl.querySelector('#episode-modal-mask');
            if (mask) injectEpSearch(mask);
        });
        // 持续尝试把 fsObs 绑定到当前/未来的全屏元素
        var bindFs = function () {
            var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (fsEl && fsEl !== window) {
                try { fsObs.observe(fsEl, { childList: true, subtree: true }); } catch (e) {}
            }
        };
        document.addEventListener('fullscreenchange', bindFs);
        document.addEventListener('webkitfullscreenchange', bindFs);
        document.addEventListener('mozfullscreenchange', bindFs);
        bindFs();
        log('选集弹窗监听已启动（含全屏补注入）');
    }

    /* ---------- 注入补丁样式 ---------- */
    function injectStyles() {
        if (document.querySelector('#' + STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent =
            '.' + PF_PREFIX + 'ep-search{display:flex;align-items:center;gap:8px;padding:8px 14px;background:#fafafa;border-bottom:1px solid #eee;z-index:2147483646;position:relative;}' +
            '.' + PF_PREFIX + 'ep-search-input{flex:1;height:30px;padding:0 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;outline:none;background:#fff;color:#333;}' +
            '.' + PF_PREFIX + 'ep-search-input:focus{border-color:#e65100;box-shadow:0 0 0 2px rgba(230,81,0,.15);}' +
            '.' + PF_PREFIX + 'ep-search-hit{font-size:12px;color:#888;white-space:nowrap;}' +
            '.' + PF_PREFIX + 'ep-search-clear{cursor:pointer;background:transparent;border:none;font-size:14px;color:#999;line-height:1;padding:4px 6px;}' +
            '.' + PF_PREFIX + 'ep-search-clear:hover{color:#333;}' +
            /* 全屏时确保弹窗及内部输入可交互 */ +
            '#episode-modal-mask{position:fixed!important;inset:0!important;z-index:2147483646!important;}' +
            '#episode-modal-mask input,' + '#episode-modal-mask button,' + '#episode-modal-mask a,' + '#episode-modal-mask .ep-item,' + '#episode-modal-mask .ep-line-tab{pointer-events:auto!important;}' +
            '#episode-modal-mask .' + PF_PREFIX + 'ep-search{position:relative;z-index:2147483647;}';
        document.head.appendChild(s);
    }

    /* ---------- 初始化 ---------- */
    function init() {
        injectStyles();
        watchEpisodeModal();
        // 若弹窗已存在（脚本加载滞后），立即注入
        var exist = document.querySelector('#episode-modal-mask');
        if (exist) injectEpSearch(exist);
        log('✅ 补丁 v6 已加载（选集搜索回车跳转+自动全屏 / 全屏弹窗搜索可用修复）');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();




/*
=============================================================
  可可影视 - 双主题（黑/白）+ 色板驱动侧边栏菜单（PakePlus 注入脚本）
-------------------------------------------------------------
  【侧边栏菜单】双主题共用一套结构（尺寸/圆角/字号/布局完全一致），
       只按主题切换色板（DARK / LIGHT 对象），保证规格统一。
       黑夜：深底 + 淡蓝灰字 + 琥珀金选中；白天：白底 + 深灰字 + 蓝选中。
       按钮三态纯 CSS 驱动，不用内联 !important，过渡流畅。
  【红色】第5组第一个菜单 a 内的 i 图标（红底白字，跨主题常驻）
  【搜索区】header 搜索区（form > div）按主题配色
  【灰图标】header 搜索按钮内 i 图标 #696969
  【导入方式】PakePlus → 项目配置 →「Script File」字段
              → 粘贴本文件全部内容 → 保存 → 重新打包
  【特性】反 DevTools 检测（type=6）+ 光圈动效 + 屏蔽元素
=============================================================
*/

// ===== 侧边栏菜单按钮 —— 双主题共用一套「结构」，只换「色板」=====
// 黑/白两模式按钮的规格完全一致：尺寸、圆角、内边距、字号、图标布局、三态逻辑
// 全部相同，唯一区别是色值。这样保证两边视觉节奏统一、不会出现「规格不一样」。
// 加新主题只需新增一个 THEME_* 对象，不必改 CSS 结构代码。
var RADIUS = "8px";     // 按钮圆角半径（双主题共用）
var BTN_W  = "168px";   // 按钮宽度（双主题共用）
var BTN_H  = "38px";    // 按钮高度（双主题共用）
var BTN_FS = "14px";    // 按钮字号（双主题共用）
var ICON   = "18px";    // 图标格宽（双主题共用）

// 黑夜主题色板（dark）
var DARK = {
  bg:        "#000000",  // 按钮默认底：纯黑
  fg:        "#C8D6E5",  // 按钮文字：淡蓝灰（比原 #ADD8E6 更柔和，对比更稳）
  border:    "#1f2733",  // 按钮描边：深灰蓝
  hoverBg:   "#1e293b",  // hover 底：石板蓝灰（替代原来的柠檬黄，与整体冷色统一）
  hoverFg:   "#ffffff",  // hover 字：纯白
  activeBg:  "#fbbf24",  // 选中底：琥珀金（比原 #FFD700 略暖，层次更好）
  activeFg:  "#0b1020",  // 选中字：近黑（与金底对比足够）
  shadow:    "rgba(251,191,36,.35)",
  container: "#000000"   // 侧边栏整体底
};

// 白天主题色板（light）
var LIGHT = {
  bg:        "#ffffff",  // 按钮默认底：纯白
  fg:        "#1f2937",  // 按钮文字：近黑深灰
  border:    "#e2e8f0",  // 按钮描边：浅灰
  hoverBg:   "#eef2f7",  // hover 底：极浅灰蓝
  hoverFg:   "#0f172a",  // hover 字：近黑
  activeBg:  "#2563eb",  // 选中底：蓝（白天模式视觉焦点，与黑夜金色对位）
  activeFg:  "#ffffff",  // 选中字：纯白
  shadow:    "rgba(37,99,235,.30)",
  container: "#ffffff"
};

// 根据当前主题取色板（供内联兜底使用）
function palette() {
  return (getTheme() === THEME_DARK) ? DARK : LIGHT;
}

// 把 #rrggbb 转成 rgba(r,g,b,a)，用于 box-shadow 等需要透明度的场景。
// 只接受 6 位十六进制，返回字符串；非法输入回退为 rgba(0,0,0,a)。
function hexToRgba(hex, alpha) {
  var h = String(hex || "").replace("#", "");
  if (h.length === 3) {
    h = h.split("").map(function (c) { return c + c; }).join("");
  }
  var r = 0, g = 0, b = 0;
  if (h.length === 6) {
    r = parseInt(h.substr(0, 2), 16) || 0;
    g = parseInt(h.substr(2, 2), 16) || 0;
    b = parseInt(h.substr(4, 2), 16) || 0;
  }
  return "rgba(" + r + "," + g + "," + b + "," + (alpha == null ? 1 : alpha) + ")";
}

// 兼容旧代码：全局背景/文字变量仍保留（仅给需求一、需求十三等容器染色用）
var BG = DARK.bg;
var FG = DARK.fg;

// ===== 主题模式（黑夜 / 白天，按网址自动切换）=====
// 判定顺序：URL 查询参数 ?theme=dark|light（临时、一次生效，不存盘）
//        → 用户手动点击切换按钮留下的记忆（localStorage，跨会话保留）
//        → 域名黑白名单匹配（SITE_THEME_MAP / SITE_BLACKLIST / SITE_WHITELIST）
//        → THEME_DEFAULT（默认白天）
// 最终主题写进 <html data-pp-theme="dark|light">，由 injectCSS() 的
// [data-pp-theme="dark"] 规则驱动黑夜专属样式；白天模式下这些规则整体失效，
// 侧边栏按钮只保留跨主题常驻规则（屏蔽元素 / 切换按钮本体 / 红色图标 / 菜单选中金）。
var THEME_KEY   = "pp_theme_mode";      // localStorage 键（存 "dark" 或 "light"）
var TOGGLE_BTN  = "body > div.t-p > div.t-p-main > div.header > div.download-app-button"; // 切换按钮挂载点
var THEME_DARK  = "dark";
var THEME_LIGHT = "light";
var THEME_DEFAULT = THEME_LIGHT;  // 未匹配任何网址时的默认主题：白天
// ---------- 域名 → 主题 映射表（按网址改变的核心配置）----------
// 匹配方式：先对当前网址逐条做「字符串包含」匹配（支持子域名与路径，
// 例如 "keke" 可同时命中 "www.keke.com" 与 "keke.com/search"），
// 命中即采用该条指定的主题；同一条可指定多个别名（同一站点 http/https/www 变体）。
// 三条表的优先级：黑名单 DARK > 白名单 LIGHT > 默认 THEME_DEFAULT。
// 添加新网址只需往对应数组里加一行字符串，无需改动其他代码。
var SITE_THEME_MAP = [
  // 格式：{ theme:"dark", hosts:["keke","另一个域名关键词"] }
  // 关键词采用「字符串包含」匹配，小写无关，子域名与路径同样命中，
  // 因此只需写一次站点的英文/中文标识即可覆盖 http/https/www 全部变体。
  // 建议关键词写长一些（如完整域名片段），避免误伤其它站点。
  { theme: "dark", hosts: ["keke", "可可"] }         // 可可影视 → 黑夜
  // { theme: "dark", hosts: ["your-dark-site-keyword"] },   // 需要黑夜的其它站点
  // { theme: "light", hosts: ["your-light-site-keyword"] }  // 需白天但仍走本脚本的站点
];
// 快捷黑名单：命中的网址一律黑夜（等价于在 SITE_THEME_MAP 里加一条 dark）
var SITE_BLACKLIST = [
  // "keke"          // 也可写在这里，写法任选
];
// 快捷白名单：命中的网址一律白天（即使被其它规则判成黑夜，白名单也更高优）
var SITE_WHITELIST = [
  // "baidu"
];

// ---------- 按网址判定主题 ----------
// 纯函数：只依赖 location.href，不读 localStorage，不写任何 DOM。
// 因此可同时被「首帧注入」「getTheme」「SPA 换页」「MutationObserver」调用。
//
// 返回三态之一：THEME_DARK / THEME_LIGHT / null
//   null 表示「网址没有匹配到任何规则」，调用方据此决定是否回退到
//   localStorage 里的手动选择或 THEME_DEFAULT。
//   之所以不直接返回 THEME_DEFAULT，是因为默认主题恰好等于某个合法值
//   时，调用方无法区分「网址判定的结论」与「没有结论」，会漏掉
//   「网址无规则时回退用户记忆」这一层逻辑。
function resolveThemeByUrl(href) {
  var url = (href || (window.location ? window.location.href : "") || "").toLowerCase();
  var verdict = null;
  // 1) 查询参数：?theme=dark 或 ?theme=light，优先级最高且只生效一次
  if (/[?&]theme=dark(&|#|$)/.test(url)) verdict = THEME_DARK;
  else if (/[?&]theme=light(&|#|$)/.test(url)) verdict = THEME_LIGHT;
  // 2) 白名单最高优（只在尚未由查询参数决定时继续判断）
  if (!verdict) {
    for (var w = 0; w < SITE_WHITELIST.length; w++) {
      if (SITE_WHITELIST[w] && url.indexOf(String(SITE_WHITELIST[w]).toLowerCase()) !== -1) {
        verdict = THEME_LIGHT; break;
      }
    }
  }
  // 3) 黑名单
  if (!verdict) {
    for (var b = 0; b < SITE_BLACKLIST.length; b++) {
      if (SITE_BLACKLIST[b] && url.indexOf(String(SITE_BLACKLIST[b]).toLowerCase()) !== -1) {
        verdict = THEME_DARK; break;
      }
    }
  }
  // 4) 映射表（按顺序，命中即返回）
  if (!verdict) {
    for (var m = 0; m < SITE_THEME_MAP.length; m++) {
      var entry = SITE_THEME_MAP[m];
      if (!entry || !entry.hosts) continue;
      var want = String(entry.theme || "").toLowerCase();
      if (want !== THEME_DARK && want !== THEME_LIGHT) continue;
      for (var h = 0; h < entry.hosts.length; h++) {
        if (entry.hosts[h] && url.indexOf(String(entry.hosts[h]).toLowerCase()) !== -1) {
          verdict = want; break;
        }
      }
      if (verdict) break;
    }
  }
  return verdict; // 可能是 null
}

// 网址 → 主题（含默认值，供首帧注入等「必须给一个确定答案」的场景使用）
function getThemeByUrl(href) {
  return resolveThemeByUrl(href) || THEME_DEFAULT;
}
// ===== 需求八（精确名单）：逐条指定的目标按钮组件 =====
// 取自 document.querySelector 逐条列举，仅这 10 个按钮参与选中/经过/圆角三态。
var TARGET_A_SELECTORS = [
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(1) > li > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(3) > li:nth-child(1) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(3) > li:nth-child(2) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(3) > li:nth-child(3) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(3) > li:nth-child(4) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(3) > li:nth-child(5) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(1) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(2) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(3) > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(5) > a"
];
var TARGET_A_ALL = TARGET_A_SELECTORS.join(",\n");

/* ============================================================
 *  ██  反 DevTools 检测模块（type=6 等）  ██
 * ============================================================ */
(function antiDevToolsDetect() {
  "use strict";

  // 1. 禁用 debugger 断点
  try {
    var _Function = window.Function;
    window.Function = function () {
      for (var i = 0; i < arguments.length; i++) {
        if (typeof arguments[i] === "string" && arguments[i].indexOf("debugger") !== -1) {
          return function () {};
        }
      }
      return _Function.apply(this, arguments);
    };
    window.Function.prototype = _Function.prototype;
  } catch (e) {}

  // 2. 覆盖 console 方法
  var noop = function () {};
  var consoleMethods = ["log", "warn", "error", "info", "debug", "table", "clear", "group", "groupEnd"];
  if (window.console) {
    for (var m = 0; m < consoleMethods.length; m++) {
      try { window.console[consoleMethods[m]] = noop; } catch (e) {}
    }
  }

  // 3. 防护 toString 检测
  try {
    var origToString = Function.prototype.toString;
    Function.prototype.toString = function () {
      if (this === window.Function || this === Function) {
        return origToString.call(function () {});
      }
      try { return origToString.call(this); } catch (e) { return "function () { [native code] }"; }
    };
  } catch (e) {}

  // 4. 拦截 setInterval / setTimeout 中的 debugger
  var _setInterval = window.setInterval;
  var _setTimeout = window.setTimeout;
  function safeFn(fn) {
    if (typeof fn === "string" && fn.indexOf("debugger") !== -1) return null;
    if (typeof fn === "function") {
      var orig = fn;
      fn = function () { try { orig(); } catch (e) {} };
    }
    return fn;
  }
  window.setInterval = function (fn, delay) {
    fn = safeFn(fn); if (!fn) return 0; return _setInterval.apply(window, arguments);
  };
  window.setTimeout = function (fn, delay) {
    fn = safeFn(fn); if (!fn) return 0; return _setTimeout.apply(window, arguments);
  };

  // 5. 降低 performance 精度
  try {
    var _now = performance.now.bind(performance);
    performance.now = function () { return Math.floor(_now() / 10) * 10; };
  } catch (e) {}

  // 6. 伪造 window.chrome
  try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
  } catch (e) {}

  // 7. 尺寸差检测绕过（type=6 核心）
  try {
    Object.defineProperty(window, "outerWidth",  { get: function () { return window.innerWidth; },  set: function () {}, configurable: false });
    Object.defineProperty(window, "outerHeight", { get: function () { return window.innerHeight; }, set: function () {}, configurable: false });
  } catch (e) {}

  // 8. 劫持 Error 堆栈
  try {
    var _Error = window.Error;
    window.Error = function (msg) {
      if (msg && typeof msg === "string" && msg.toLowerCase().indexOf("devtool") !== -1) return new _Error("");
      return new _Error(msg);
    };
    window.Error.prototype = _Error.prototype;
  } catch (e) {}

  // 9. 全局错误捕获
  window.addEventListener("error", function (e) {
    var msg = e.message || "";
    if (msg.indexOf("debugger") !== -1 || msg.indexOf("devtool") !== -1) { e.preventDefault(); e.stopPropagation(); return true; }
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var reason = String(e.reason || "");
    if (reason.indexOf("debugger") !== -1 || reason.indexOf("devtool") !== -1) { e.preventDefault(); return true; }
  }, true);

  // 10. 定时清除检测标记
  // ★ v0.0.6 优化：扫描间隔由 500ms 放宽到 3000ms，并限定扫描范围，
  //    避免高频遍历 Object.keys(window) 带来的持续性能开销。
  var _devtoolKeys = ["__devtool", "devtool", "devtools", "_devtools"];
  setInterval(function () {
    try {
      for (var k = 0; k < _devtoolKeys.length; k++) {
        var key = _devtoolKeys[k];
        if (window[key] !== undefined) {
          try { window[key] = false; } catch (e) {}
        }
      }
    } catch (e) {}
  }, 3000);

})();

/* ============================================================
 *  ██  主题 + 布局 + 动效 模块  ██
 * ============================================================ */

// ---------- 侧边栏菜单 a 选择器 ----------
// 整组 ul 级别（接管组内所有按钮，不再逐个写 li 索引）
var MENU_UL_SELECTORS = [
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(1)",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(3)",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5)"
];
var MENU_UL_ALL = MENU_UL_SELECTORS.join(",\n");

// 组内每个按钮 a（用于事件绑定 / 兜底涂色）
var MENU_A_SELECTORS = [
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(1) > li > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(3) > li > a",
  "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li > a"
];
var MENU_A_ALL = MENU_A_SELECTORS.join(",\n");

// 需求三（精确）：第5组【第一个】菜单 a 内的 i 图标 → 圆形 + 红底 + 白字
var MENU_ICON_RED = "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(1) > a > i";
// 该图标所在的 a 也要清掉黑底，避免圆形红底被矩形黑底盖住
var MENU_ICON_RED_A = "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(1) > a";

// 需求一（新）：需要染成纯黑的容器组件
var BLACK_CONTAINERS = [
  "body > div.t-p > div.t-p-side",                                   // 侧边栏整体
  "body > div.t-p > div.t-p-main > div.header"                       // 顶部 header
];

// ===== 需求十五：header 历史记录弹层（popup-menu-group）=====
// 组件本体：纯黑底 #000 + 淡蓝字 #ADD8E6；内部按钮三态圆角：
// 默认深底 + 淡蓝灰字 / hover 石板蓝灰 / 选中琥珀金；白天对应白底 + 深灰字 / 浅灰蓝 / 蓝。
// 该弹层是站点动态插入的浮层，须同时写入 CSS 与内联兜底，防站点运行时覆盖。
var HISTORY_BOX = "body > div.t-p > div.t-p-main > div.header > div.history-box";
var HISTORY_PANEL = HISTORY_BOX + " > div";                         // 浮层根节点
var HISTORY_POPUP = HISTORY_BOX + " > div > div.popup-menu-group";
var HISTORY_FOOTER_A = HISTORY_BOX + " div.his-popup-box-footer > a";      // 弹层底部按钮（原黄字）
var HISTORY_INNER    = HISTORY_POPUP + ", " + HISTORY_FOOTER_A;           // 内部按钮全集

// ===== 需求八：侧边栏 div.main 内按钮统一为黑底白字 =====
// 这一块是「恢复区」：本脚本的菜单接管、强制涂色、白字兜底都会跳过它，
// CSS 层强制锁死 #000 底 + #fff 字。
var SIDE_MAIN = "body > div.t-p > div.t-p-side > div > div.main";

// ===== 需求（新增）：div.main 内【所有】按钮组件 =====
// 不限定组号、不限定逐条名单，凡位于 div.main 内的 a / button 一律纳入，
// 三态统一为：默认底配字色 / hover 对位浅色 / 选中对位强调色，且均为圆角按钮（色值由 DARK / LIGHT 色板驱动）。
var MAIN_BUTTONS_ALL   = SIDE_MAIN + " a, " + SIDE_MAIN + " button";
var MAIN_BUTTONS_HOVER = SIDE_MAIN + " a:hover, " + SIDE_MAIN + " button:hover";
var MAIN_BUTTONS_ACTIVE = SIDE_MAIN + " a.active, " + SIDE_MAIN + " a[aria-current], " + SIDE_MAIN + " a.on, " + SIDE_MAIN + " a.selected, " + SIDE_MAIN + " button.active, " + SIDE_MAIN + " button[aria-current], " + SIDE_MAIN + " button.on, " + SIDE_MAIN + " button.selected";

// 需求二 & 六：屏蔽的组件
var HIDDEN_SELECTORS = [
  "body > div.t-p > div.t-p-main > div.main > div.tab-box-wrap.fs-margin-section > div.side", // 需求二
  "body > div.t-p > div.t-p-main > div.header > div.form-box.fs-margin-section-left > form > div > div" // 需求六
];

// 需求十一：header 搜索区（form > div）纯黑底 #000000 + 文字淡蓝 #ADD8E6
var HEADER_FORM_AREA = "body > div.t-p > div.t-p-main > div.header > div.form-box.fs-margin-section-left > form > div";
// 需求十二：header 搜索按钮内 i 图标灰 #696969（仅图标，不改底）
var HEADER_FORM_BTN_ICON = "body > div.t-p > div.t-p-main > div.header > div.form-box.fs-margin-section-left > form > div > button > i";

// 需求七：需要加光圈动效的组件
var GLOW_SELECTORS = [
  "body > div.t-p > div.t-p-main > div.header > div.form-box.fs-margin-section-left > form > div",
  "#loginForm > div > div.form-area-main > div:nth-child(1)",
  "#loginForm > div > div.form-area-main > div:nth-child(2)",
  "#registForm > div > div.form-area-main > div:nth-child(1)",
  "#registForm > div > div.form-area-main > div:nth-child(2)",
  "#registForm > div > div.form-area-main > div:nth-child(3)",
  // ★ 反馈页输入区 + 编辑资料页三行信息行：柔和外发光，随主题色切换
  "#feedbackForm > div.input-area",
  "#editForm > div:nth-child(2) > div.user-info-row-main",
  "#editForm > div:nth-child(3) > div.user-info-row-main",
  "#editForm > div:nth-child(4) > div.user-info-row-main"
];

// 需求十三：搜索结果页（搜索后跳转的目标页）主内容区
// 以 t-p-main > .main 为主战场：侧边栏与 header 另有专属配色，不参与本次黑字改动。
var SEARCH_RESULT_AREA = "body > div.t-p > div.t-p-main > div.main";
// 卡片内的浅灰信息块：浅底必须配黑字，否则文字被底吃掉
var SEARCH_RESULT_CARD_INFO = SEARCH_RESULT_AREA + " *[class*='info'], " + SEARCH_RESULT_AREA + " *[class*='Info']";

// 需求十四：搜索结果页顶部提示条 —— 白字 #FFFFFF
// 形如「搜索"元图"，找到 90 部影片」的蓝色提示条。
// 此类提示条是站点动态插入的，必须按"任意层级的蓝色底元素"去匹配，
// 无法事先确定其 class 名，因此这里只定义兜底范围。

// 需求五：屏蔽表单自动填充
var AUTOFILL_FIELDS = [
  "input[type='text']",
  "input[type='password']",
  "input[type='email']",
  "input[type='search']",
  "input:not([type])",
  "textarea",
  "select"
];

// ---------- 尽早注入「首帧」样式（保证首屏不闪烁）----------
// 此函数会在脚本加载的第一时间同步执行。
// 判定顺序与 getTheme() 一致：先按当前网址决定，再回退到 localStorage 记忆。
// 黑夜铺纯黑，白天铺纯白，这样 injectCSS() 生效前的那 1~2 帧不会露白/露灰。
// 颜色/菜单三态等精细逻辑全部交给 injectCSS()，避免优先级冲突。
function injectEarlyBlack() {
  var mode = getTheme();
  var html = document.documentElement;
  if (html) html.setAttribute("data-pp-theme", mode);
  var s = document.getElementById("pp-early-black");
  if (!s) {
    s = document.createElement("style");
    s.id = "pp-early-black";
    var target = document.head || document.documentElement || document.body;
    if (target) target.appendChild(s);
  }
  // 精细配色仍交给 injectCSS() 与内联兜底，此处只负责「底色不露白」。
  s.textContent = (mode === THEME_DARK)
    ? "html,body,:root{background-color:" + BG + "!important}html,body{color:" + FG + "!important}"
    : "html,body{background-color:#ffffff!important}";
}
injectEarlyBlack(); // ← 立即执行（不等 DOMContentLoaded）

// ---------- 完整样式（DOM 就绪后注入）----------
// 样式分两类：
//   A. 黑夜专属：整段用 [data-pp-theme="dark"] 前缀包裹，白天模式自动失效
//   B. 跨主题常驻：屏蔽元素、切换按钮本体、红色图标、选中金色等，昼夜都生效
function injectCSS() {
  var rules = [];

  // ============ A. 黑夜专属样式（白天模式下自动失效）============
  // 用一个 SCOPE 前缀把每条规则的选择器包起来
  var SCOPE = "[data-pp-theme=\"dark\"]";

  // 组装一条「黑夜专属」规则：给原选择器加 [data-pp-theme="dark"] 前缀
  function dark(sel) {
    // sel 可能是多行、多选择器（逗号分隔），逐条前缀
    return sel.split(",").map(function (s) { return SCOPE + " " + s.trim(); }).join(",\n");
  }

  // ===== 恢复站点原始字体与 CSS 变量（站点原生声明原样保留）=====
  rules.push(SCOPE + " :root {");
  rules.push("  color-scheme: dark !important;");
  rules.push("  font-family: PingFang SC, HarmonyOS_Regular, Helvetica Neue, Microsoft YaHei, sans-serif !important;");
  rules.push("  --fs-primary-color:#ffd000;");
  rules.push("  --fs-second-color:#41ac52;");
  rules.push("  --fs-third-color:#ff3300;");
  rules.push("  --fs-fourth-color:#ff6600;");
  rules.push("  --fs-fifth-color:#ff9900;");
  rules.push("  --fs-text-color:#393e41;");
  rules.push("  --fs-text-second-color:#333;");
  rules.push("  --fs-text-third-color:#666;");
  rules.push("  --fs-text-fourth-color:#999;");
  rules.push("  --fs-text-fifth-color:#ffffff;");
  rules.push("  --fs-text-six-color:#adb7be;");
  rules.push("  --fs-gray-primary-color:#333;");
  rules.push("  --fs-gray-second-color:#666;");
  rules.push("  --fs-gray-third-color:#999;");
  rules.push("  --fs-highlight-color:#33bb00;");
  rules.push("  --fs-background-color:#ffffff;");
  rules.push("  --fs-background-second-color:#efefef;");
  rules.push("  --fs-background-third-color:#262626;");
  rules.push("  --fs-background-fourth-color:#1d1c1e;");
  rules.push("  --fs-background-fifth-color:#181818;");
  rules.push("  --fs-background-six-color:#ffffff;");
  rules.push("  --fs-background-seven-color:rgba(245,245,245,1);");
  rules.push("  --fs-btn-normal-background-color:#393a43;");
  rules.push("  --fs-btn-normal-text-color:#ebebeb;");
  rules.push("  --fs-btn-normal-background-second-color:rgba(var(--fs-accent-black),var(--fs-opacity-5));");
  rules.push("  --fs-btn-normal-text-second-color:var(--fs-text-third-color);");
  rules.push("  --fs-btn-hover-background-second-color:rgba(255,214,119,.2);");
  rules.push("  --fs-btn-hover-text-second-color:var(--fs-text-second-color);");
  rules.push("  --fs-border-normal-color:#ddd;");
  rules.push("  --fs-border-highlight-color:#adb7be;");
  rules.push("  --fs-high-color:#eae2b7;");
  rules.push("  --fs-seperator-color:#efefef;");
  rules.push("  --fs-seperator-second-color:#eaeaea;");
  rules.push("  --fs-spacing:1rem;");
  rules.push("  --fs-accent-black:0,0,0;");
  rules.push("  --fs-accent-white:255,255,255;");
  rules.push("  --fs-opacity-4:4%;");
  rules.push("  --fs-opacity-5:5%;");
  rules.push("  --swiper-navigation-size:44px;");
  rules.push("  --swiper-theme-color:var(--fs-primary-color);");
  rules.push("  --swiper-pagination-bullet-inactive-color:white;");
  rules.push("  --swiper-pagination-bullet-size:.625rem;");
  rules.push("}");
  // 黑底映射：把站点用于「浅色背景」的变量重新指向深色，站点组件自然变暗
  rules.push(SCOPE + " :root {");
  rules.push("  --fs-background-color:#000000 !important;");
  rules.push("  --fs-background-second-color:#000000 !important;");
  rules.push("  --fs-background-six-color:#000000 !important;");
  rules.push("  --fs-background-seven-color:#111111 !important;");
  rules.push("  --fs-seperator-color:#1a1a1a !important;");
  rules.push("  --fs-seperator-second-color:#1a1a1a !important;");
  rules.push("  --fs-border-normal-color:#1a1a1a !important;");
  rules.push("}");
  // 全局黑夜底：纯黑 + 淡蓝字
  rules.push(SCOPE + " html, " + SCOPE + " body { background-color:" + BG + " !important; color:" + FG + " !important; }");
  rules.push(SCOPE + " html, " + SCOPE + " body, " + SCOPE + " * { scrollbar-color: #444 " + BG + " !important; }");

  // ===== 需求一：指定容器 = 纯黑（穿透子元素，覆盖站点后加载样式表）=====
  // 说明：
  // 1. background 连写 + background-color 单写，同时清掉 linear-gradient / 背景图；
  // 2. background-image 显式置 none，防站点用 ::before / 渐变遮罩留白；
  // 3. 子元素统一淡蓝字，但保留红色图标规则（需求三）的红底，此处不侵入。
  var _bc = BLACK_CONTAINERS.join("," + String.fromCharCode(10));
  rules.push(dark(_bc) + ",");
  rules.push(dark(_bc) + " > *,");
  rules.push(dark(_bc) + " * {");
  rules.push("  background:" + BG + " !important;");
  rules.push("  background-color:" + BG + " !important;");
  rules.push("  background-image:none !important;");
  rules.push("  color:" + FG + " !important;");
  rules.push("  border-color:#1a1a1a !important;");
  rules.push("}");
  // header 内输入框/按钮：保留淡蓝字，去掉站点渐变底
  rules.push(dark("body > div.t-p > div.t-p-main > div.header input,"));
  rules.push(dark("body > div.t-p > div.t-p-main > div.header button,"));
  rules.push(dark("body > div.t-p > div.t-p-main > div.header a") + " {");
  rules.push("  color:" + FG + " !important;");
  rules.push("  background-color:" + BG + " !important;");
  rules.push("  background-image:none !important;");
  rules.push("}");

  // ===== 侧边栏 div.main 菜单按钮 —— 双主题共用一套结构，只换色板 =====
  // [结构] 两模式规格完全一致：BTN_W × BTN_H 固定尺寸、RADIUS 圆角、8px 内边距、
  //        flex 水平布局（图标定宽 ICON 左对齐 + 文字撑满右接）、字号 BTN_FS、
  //        三态逻辑（默认 / hover / 选中）。唯一差别是色值。
  // [配色] 黑夜 = DARK 色板（深底 + 淡蓝灰字 + 琥珀金选中）
  //        白天 = LIGHT 色板（白底 + 深灰字 + 蓝选中）
  // [对齐] line-height 改用「1.2」并配合 flex 垂直居中，彻底消灭旧版 40px 与 38px
  //        容器高度冲突导致的文字下沉/溢出问题。
  // [过渡] 只用 CSS 类选择器控制三态，全程不写内联 background-color，保证
  //        transition 能正常插值（hover 无延迟、选中态不被覆盖）。
  var SIDE_UL = SIDE_MAIN + " ul";
  var SIDE_LI = SIDE_MAIN + " ul > li";
  var MENU_A = SIDE_MAIN + " ul > li > a";
  var MENU_I = SIDE_MAIN + " ul > li > a > i";
  var MENU_SPAN = SIDE_MAIN + " ul > li > a > span";
  // 组标题（若有）：独立成行，不参与按钮网格，与按钮保持间距
  var GROUP_TITLE = SIDE_MAIN + " ul > .group-title, " + SIDE_MAIN + " ul > li.group-title, " + SIDE_MAIN + " ul > .menu-group-title, " + SIDE_MAIN + " ul > li.menu-group-title";

  // ---- 共用结构（双主题完全一致，无需套 dark() 前缀）----
  rules.push(MENU_A + " {");
  rules.push("  box-sizing:border-box !important;");
  rules.push("  display:flex !important;");
  rules.push("  flex-direction:row !important;");
  rules.push("  align-items:center !important;");
  rules.push("  justify-content:flex-start !important;");
  rules.push("  gap:10px !important;");
  rules.push("  width:" + BTN_W + " !important;");
  rules.push("  max-width:" + BTN_W + " !important;");
  rules.push("  min-width:" + BTN_W + " !important;");
  rules.push("  height:" + BTN_H + " !important;");
  rules.push("  max-height:" + BTN_H + " !important;");
  rules.push("  min-height:" + BTN_H + " !important;");
  rules.push("  padding:0 12px !important;");
  rules.push("  border:1px solid;");
  rules.push("  border-radius:" + RADIUS + " !important;");
  rules.push("  font-size:" + BTN_FS + " !important;");
  rules.push("  font-weight:500 !important;");
  rules.push("  line-height:1.2 !important;");
  rules.push("  letter-spacing:.01em !important;");
  rules.push("  text-decoration:none !important;");
  rules.push("  text-align:left !important;");
  rules.push("  white-space:nowrap !important;");
  rules.push("  overflow:hidden !important;");
  rules.push("  text-overflow:ellipsis !important;");
  rules.push("  -webkit-font-smoothing:antialiased !important;");
  rules.push("  -moz-osx-font-smoothing:grayscale !important;");
  rules.push("  box-shadow:none !important;");
  rules.push("  transition:background-color .2s ease, color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .1s ease !important;");
  rules.push("  outline:none !important;");
  rules.push("}");
  rules.push(MENU_I + " {");
  rules.push("  display:inline-flex !important;");
  rules.push("  flex:0 0 auto !important;");
  rules.push("  align-items:center !important;");
  rules.push("  justify-content:center !important;");
  rules.push("  width:" + ICON + " !important;");
  rules.push("  height:" + ICON + " !important;");
  rules.push("  margin:0 !important;");
  rules.push("  padding:0 !important;");
  rules.push("  font-size:" + ICON + " !important;");
  rules.push("  line-height:1 !important;");
  rules.push("  background-color:transparent !important;");
  rules.push("  border-radius:4px !important;");
  rules.push("  transition:color .2s ease, background-color .2s ease !important;");
  rules.push("}");
  rules.push(MENU_SPAN + " {");
  rules.push("  display:block !important;");
  rules.push("  flex:1 1 auto !important;");
  rules.push("  min-width:0 !important;");
  rules.push("  color:inherit !important;");
  rules.push("  font-size:" + BTN_FS + " !important;");
  rules.push("  font-weight:500 !important;");
  rules.push("  line-height:1.2 !important;");
  rules.push("  letter-spacing:.01em !important;");
  rules.push("  text-align:left !important;");
  rules.push("  white-space:nowrap !important;");
  rules.push("  overflow:hidden !important;");
  rules.push("  text-overflow:ellipsis !important;");
  rules.push("}");
  rules.push(MENU_A + ":active { transform:scale(.97) !important; }");

  // ---- 按主题注入「配色」：用 JS 循环生成，保证两边色值同步、不漏项 ----
  var themes = [
    { scope: dark(MENU_A), theme: DARK },
    { scope: "[data-pp-theme=\"light\"] " + MENU_A, theme: LIGHT }
  ];
  for (var t = 0; t < themes.length; t++) {
    var SC = themes[t].scope, P = themes[t].theme;
    // 默认态
    rules.push(SC + " {");
    rules.push("  background-color:" + P.bg + " !important;");
    rules.push("  background-image:none !important;");
    rules.push("  border-color:" + P.border + " !important;");
    rules.push("  color:" + P.fg + " !important;");
    rules.push("}");
    // hover 态：底色 + 反白字
    rules.push(SC + ":hover, " + SC + ".pp-hover {");
    rules.push("  background-color:" + P.hoverBg + " !important;");
    rules.push("  border-color:" + P.hoverBg + " !important;");
    rules.push("  color:" + P.hoverFg + " !important;");
    rules.push("  box-shadow:0 2px 10px " + hexToRgba(P.hoverBg, .28) + " !important;");
    rules.push("}");
    rules.push(SC + ":hover > i, " + SC + ".pp-hover > i { color:" + P.hoverFg + " !important; background-color:transparent !important; }");
    rules.push(SC + ":hover > span, " + SC + ".pp-hover > span { color:" + P.hoverFg + " !important; }");
    // 选中态：琥珀金/蓝底 + 近黑/白字，描边同色消边 + 外发光内高光
    rules.push(SC + ".active, " + SC + "[data-pp-active=\"true\"] {");
    rules.push("  background-color:" + P.activeBg + " !important;");
    rules.push("  border-color:" + P.activeBg + " !important;");
    rules.push("  color:" + P.activeFg + " !important;");
    rules.push("  font-weight:600 !important;");
    rules.push("  box-shadow:0 3px 14px " + P.shadow + ", inset 0 1px 0 rgba(255,255,255,.45) !important;");
    rules.push("}");
    rules.push(SC + ".active > i, " + SC + "[data-pp-active=\"true\"] > i { color:" + P.activeFg + " !important; background-color:transparent !important; }");
    rules.push(SC + ".active > span, " + SC + "[data-pp-active=\"true\"] > span { color:" + P.activeFg + " !important; }");
  }

  // ===== 需求（新增）：第 5 组第一个按钮 —— 独立三态 =====
  // 默认：纯黑底 + 淡蓝字；hover：柠檬绸 #FFFACD；选中：琥珀金 #FFD700。
  // 这几个值属于该按钮专属规格，不进色板，直接写死，避免被 DARK/LIGHT 通配规则覆盖。
  // 该按钮的 i 图标（圆形红底白字）独立管理，下方规则只作用于 a 本体，不触碰 i 的颜色。
  rules.push(MENU_ICON_RED_A + " {");
  rules.push("  background-color:#000000 !important;");
  rules.push("  color:#ADD8E6 !important;");
  rules.push("  border-color:#1f2733 !important;");
  rules.push("}");
  rules.push(MENU_ICON_RED_A + ":hover {");
  rules.push("  background-color:#FFFACD !important;");
  rules.push("  color:#000000 !important;");
  rules.push("  border-color:#FFFACD !important;");
  rules.push("}");
  rules.push(MENU_ICON_RED_A + ".active,");
  rules.push(MENU_ICON_RED_A + "[data-pp-active=\"true\"] {");
  rules.push("  background-color:#FFD700 !important;");
  rules.push("  color:#000000 !important;");
  rules.push("  border-color:#FFD700 !important;");
  rules.push("  font-weight:600 !important;");
  rules.push("}");
  // 第 5 组首个红底图标：复位按钮边框与阴影，红底白字规则见 B3
  rules.push(MENU_ICON_RED_A + " { border-color:transparent !important; box-shadow:none !important; }");

  // 组标题：只在黑夜专属范围里套暗色（白天下让站点原生色透出）
  rules.push(dark(GROUP_TITLE) + " {");
  rules.push("  display:block !important;");
  rules.push("  width:100% !important;");
  rules.push("  margin:18px 0 8px !important;");
  rules.push("  padding:0 12px !important;");
  rules.push("  font-size:12px !important;");
  rules.push("  line-height:1.4 !important;");
  rules.push("  color:" + DARK.fg + " !important;");
  rules.push("  opacity:.6 !important;");
  rules.push("  letter-spacing:.08em !important;");
  rules.push("  text-transform:uppercase !important;");
  rules.push("}");

  // 需求十二：第 5 组选中项强制金色（跨主题：昼夜都金，见下方 B 段）
  var MENU5_ACTIVE_A =
    "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li.menu-item.menu-item-active > a";

  // 需求三：第5组第一个菜单 a 内的 i 图标 = 圆形红底 + 白字（跨主题常驻，见下方 B 段）

  // ===== 需求十一：header 搜索区（form > div）纯黑底 #000 + 文字 #ADD8E6 =====
  rules.push(dark(HEADER_FORM_AREA) + " {");
  rules.push("  background-color:#000000 !important;");
  rules.push("  color:#ADD8E6 !important;");
  rules.push("  border-color:#000000 !important;");
  rules.push("}");
  rules.push(dark(HEADER_FORM_AREA + " *") + " { color:#ADD8E6 !important; }");
  rules.push(dark(HEADER_FORM_AREA + " input") + " {");
  rules.push("  background-color:#1a1a1a !important;");
  rules.push("  color:#ADD8E6 !important;");
  rules.push("  caret-color:#ADD8E6 !important;");
  rules.push("  border-color:#ADD8E6 !important;");
  rules.push("}");
  rules.push(dark(HEADER_FORM_AREA + " input::placeholder") + " { color:#ADD8E6 !important; opacity:1 !important; }");
  rules.push(dark(HEADER_FORM_AREA + " input::selection") + " { background-color:#ADD8E6 !important; color:#000000 !important; }");

  // 需求十二：搜索按钮内 i 图标灰 #696969（跨主题常驻，见下方 B 段）

  // 需求二 & 六：隐藏指定组件（跨主题常驻，昼夜都屏蔽，见下方 B 段）

  // ===== 需求十五：header 历史记录弹层（昼夜都黑底，见下方 B 段）=====

  // 需求七：光圈动效（跨主题常驻：黑夜琥珀金，白天冷蓝，hover/长按都点亮）
  // 色值拆成变量，hover 与长按复用同一份强光圈，避免两处写死不一致。
  var glowIdleDark  = "rgba(245,197,24,.25)";
  var glowMidDark   = "rgba(245,197,24,.55)";
  var glowStrongDark = "0 0 18px 4px rgba(245,197,24,.75), 0 0 4px 1px rgba(255,255,255,.6)";
  var glowIdleLight  = "rgba(59,130,246,.30)";
  var glowMidLight   = "rgba(59,130,246,.60)";
  var glowStrongLight = "0 0 18px 5px rgba(59,130,246,.70), 0 0 4px 1px rgba(255,255,255,.85)";
  var _glowSel = GLOW_SELECTORS.join(",\n");
  rules.push(_glowSel + " {");
  rules.push("  position:relative;");
  rules.push("  border-radius:8px;");
  rules.push("  transition:box-shadow .35s ease, transform .35s ease;");
  rules.push("}");
  rules.push(dark(_glowSel) + " { animation:ppGlowIdleDark 2.6s ease-in-out infinite; box-shadow:0 0 0 0 " + glowIdleDark + "; }");
  rules.push("[data-pp-theme=\"light\"] " + _glowSel + " { animation:ppGlowIdleLight 2.6s ease-in-out infinite; box-shadow:0 0 0 0 " + glowIdleLight + "; }");
  rules.push(dark(GLOW_SELECTORS.join(",") + ":hover") + " { animation:none !important; box-shadow:" + glowStrongDark + " !important; transform:translateY(-1px); }");
  rules.push("[data-pp-theme=\"light\"] " + GLOW_SELECTORS.join(",") + ":hover { animation:none !important; box-shadow:" + glowStrongLight + " !important; transform:translateY(-1px); }");
  rules.push(dark(GLOW_SELECTORS.join(",") + ".pp-glow-on") + " { animation:none !important; box-shadow:" + glowStrongDark + " !important; transform:translateY(-1px); }");
  rules.push("[data-pp-theme=\"light\"] " + GLOW_SELECTORS.join(",") + ".pp-glow-on { animation:none !important; box-shadow:" + glowStrongLight + " !important; transform:translateY(-1px); }");

  // ===== 需求十三：搜索结果页 —— 黑底 #000 + 淡蓝字 #ADD8E6 =====
  rules.push(dark(SEARCH_RESULT_AREA) + " { background-color:" + BG + " !important; }");
  rules.push(dark(SEARCH_RESULT_AREA + " *") + " { color:#ADD8E6 !important; }");
  rules.push(dark(SEARCH_RESULT_CARD_INFO) + " { background-color:#000000 !important; color:#ADD8E6 !important; }");
  rules.push(dark(SEARCH_RESULT_CARD_INFO) + " * { color:#ADD8E6 !important; }");

  // ===== 需求十四：搜索结果页顶部提示条 =====
  var tipSel = [
    SEARCH_RESULT_AREA + " [class*='tip']",
    SEARCH_RESULT_AREA + " [class*='Tip']",
    SEARCH_RESULT_AREA + " [class*='search-tip']",
    SEARCH_RESULT_AREA + " [class*='searchTip']",
    SEARCH_RESULT_AREA + " [class*='count']",
    SEARCH_RESULT_AREA + " [class*='Count']",
    SEARCH_RESULT_AREA + " [class*='tip-count']"
  ];
  var tipDark = tipSel.map(function (t) { return SCOPE + " " + t; }).join(",\n");
  rules.push(tipDark + " {");
  rules.push("  background-color:#000000 !important;");
  rules.push("  color:#ADD8E6 !important;");
  rules.push("}");
  var tipDarkKids = tipSel.map(function (t) { return SCOPE + " " + t + " *"; }).join(",\n");
  rules.push(tipDarkKids + " {");
  rules.push("  background-color:transparent !important;");
  rules.push("  color:#ADD8E6 !important;");
  rules.push("}");

  // [FIX] 最高优先级选中态：直接读站点自身的 li.menu-item-active 标记，
  //       不依赖 a.active 镜像是否跑完、也不被内联黑底覆盖。
  //       用色板驱动，黑夜=琥珀金、白天=蓝，与上方卡片形态保持一致。
  var _actSel = SIDE_MAIN + " ul li.menu-item-active > a";
  var _actDark  = dark(_actSel);
  var _actLight = "[data-pp-theme=\"light\"] " + _actSel;
  var _actPairs = [
    { sel: _actDark,  P: DARK },
    { sel: _actLight, P: LIGHT }
  ];
  for (var _a = 0; _a < _actPairs.length; _a++) {
    var _AP = _actPairs[_a].P, _AS = _actPairs[_a].sel;
    rules.push(_AS + " {");
    rules.push("  width:" + BTN_W + " !important;");
    rules.push("  max-width:" + BTN_W + " !important;");
    rules.push("  min-width:" + BTN_W + " !important;");
    rules.push("  height:" + BTN_H + " !important;");
    rules.push("  max-height:" + BTN_H + " !important;");
    rules.push("  min-height:" + BTN_H + " !important;");
    rules.push("  border-radius:" + RADIUS + " !important;");
    rules.push("  background-color:" + _AP.activeBg + " !important;");
    rules.push("  color:" + _AP.activeFg + " !important;");
    rules.push("  border-color:" + _AP.activeBg + " !important;");
    rules.push("  font-weight:600 !important;");
    rules.push("  box-shadow:0 3px 14px " + _AP.shadow + ", inset 0 1px 0 rgba(255,255,255,.45) !important;");
    rules.push("}");
    rules.push(_AS + " > i { color:" + _AP.activeFg + " !important; background-color:transparent !important; }");
    rules.push(_AS + " > span { color:" + _AP.activeFg + " !important; }");
  }

  rules.push("@keyframes ppGlowIdleDark {");
  rules.push("  0%, 100% { box-shadow:0 0 4px 0 " + glowIdleDark + "; }");
  rules.push("  50%      { box-shadow:0 0 12px 2px " + glowMidDark + "; }");
  rules.push("}");
  rules.push("@keyframes ppGlowIdleLight {");
  rules.push("  0%, 100% { box-shadow:0 0 4px 0 " + glowIdleLight + "; }");
  rules.push("  50%      { box-shadow:0 0 14px 3px " + glowMidLight + "; }");
  rules.push("}");

  // ============ B. 跨主题常驻样式（黑夜白天都生效）============
  // 这些规则不依赖 [data-pp-theme]，昼夜都执行。

  // B1. 屏蔽元素：需求二 & 六（昼夜都屏蔽）
  rules.push(HIDDEN_SELECTORS.join(",\n") + " { display:none !important; visibility:hidden !important; opacity:0 !important; pointer-events:none !important; }");

  // B2. 第5组选中项：用色板驱动，昼夜各自的对位色（金 / 蓝），与卡片形态保持一致
  // 同时补一条「站点标记的 li.menu-item-active 直接子 a」，覆盖站点没给 a 加 active 的情况。
  var dark5  = dark(MENU5_ACTIVE_A);
  var light5 = "[data-pp-theme=\"light\"] " + MENU5_ACTIVE_A;
  var activeSel = SIDE_MAIN + " ul li.menu-item-active > a";
  var darkAct  = dark(activeSel);
  var lightAct = "[data-pp-theme=\"light\"] " + activeSel;
  var fives = [
    { sel: dark5,  P: DARK },
    { sel: light5, P: LIGHT },
    { sel: darkAct,  P: DARK },
    { sel: lightAct, P: LIGHT }
  ];
  for (var f = 0; f < fives.length; f++) {
    var FS = fives[f].sel, FP = fives[f].P;
    rules.push(FS + " {");
    rules.push("  background-color:" + FP.activeBg + " !important;");
    rules.push("  color:" + FP.activeFg + " !important;");
    rules.push("  border-color:" + FP.activeBg + " !important;");
    rules.push("  font-weight:600 !important;");
    rules.push("  box-shadow:0 3px 14px " + FP.shadow + ", inset 0 1px 0 rgba(255,255,255,.45) !important;");
    rules.push("}");
    rules.push(FS + " > i { color:" + FP.activeFg + " !important; background-color:transparent !important; }");
    rules.push(FS + " > span { color:" + FP.activeFg + " !important; }");
    rules.push(FS + ":hover { background-color:" + FP.activeBg + " !important; color:" + FP.activeFg + " !important; border-color:" + FP.activeBg + " !important; }");
  }

  // B3. 红色图标：精确胶囊形 24.69 × 14，圆角取高度一半（7px），字 #FDF5E6
  var RED_ICON_BG = "#FF0000", RED_ICON_FG = "#FDF5E6", RED_ICON_HOVER = "#CC0000";
  rules.push(MENU_ICON_RED_A + " { background-color:transparent !important; }");
  rules.push(MENU_ICON_RED_A + ":hover { background-color:rgba(255,0,0,.14) !important; }");
  rules.push(MENU_ICON_RED + " {");
  rules.push("  display:inline-flex !important;");
  rules.push("  align-items:center !important;");
  rules.push("  justify-content:center !important;");
  rules.push("  width:24.69px !important;");
  rules.push("  min-width:24.69px !important;");
  rules.push("  max-width:24.69px !important;");
  rules.push("  height:14px !important;");
  rules.push("  min-height:14px !important;");
  rules.push("  max-height:14px !important;");
  rules.push("  line-height:14px !important;");
  rules.push("  padding:0 !important;");
  rules.push("  border-radius:7px !important;");
  rules.push("  background-color:" + RED_ICON_BG + " !important;");
  rules.push("  color:" + RED_ICON_FG + " !important;");
  rules.push("  font-size:9px !important;");
  rules.push("  overflow:hidden !important;");
  rules.push("  white-space:nowrap !important;");
  rules.push("  text-align:center !important;");
  rules.push("}");
  rules.push(MENU_ICON_RED + ":hover { background-color:" + RED_ICON_HOVER + " !important; color:" + RED_ICON_FG + " !important; }");

  // B4. 历史记录弹层：本体跟主题色板走，按钮三态由 DARK / LIGHT 驱动
  // （昼夜不再统一黑底，白天切过来是白底深灰字 + 蓝强调色，与全局主题一致）
  var _HB = HISTORY_PANEL, _HP = HISTORY_POPUP, _HF = HISTORY_FOOTER_A;
  var _HP_SEL_DARK  = dark(_HP + " a, " + _HP + " button");
  var _HP_SEL_LIGHT = "[data-pp-theme=\"light\"] " + _HP + " a, [data-pp-theme=\"light\"] " + _HP + " button";
  function histBoxRule(sel, P, shadow) {
    rules.push(sel + " {");
    rules.push("  background-color:" + P.bg + " !important;");
    rules.push("  color:" + P.fg + " !important;");
    rules.push("  border-color:" + P.border + " !important;");
    if (shadow) rules.push("  box-shadow:" + shadow + " !important;");
    rules.push("}");
  }
  histBoxRule(dark(_HB), DARK);
  histBoxRule("[data-pp-theme=\"light\"] " + _HB, LIGHT);
  histBoxRule(dark(_HP), DARK, "0 2px 12px rgba(0,0,0,.85)");
  histBoxRule("[data-pp-theme=\"light\"] " + _HP, LIGHT, "0 2px 12px rgba(0,0,0,.12)");
  // 默认态：底配字色 + 圆角
  histBoxRule(_HP_SEL_DARK, DARK);
  histBoxRule(_HP_SEL_LIGHT, LIGHT);
  // hover 态
  rules.push(dark(_HP + " a:hover, " + _HP + " button:hover") + " { background-color:" + DARK.hoverBg + " !important; color:" + DARK.hoverFg + " !important; }");
  rules.push("[data-pp-theme=\"light\"] " + _HP + " a:hover, [data-pp-theme=\"light\"] " + _HP + " button:hover { background-color:" + LIGHT.hoverBg + " !important; color:" + LIGHT.hoverFg + " !important; }");
  // 选中态：色板强调色
  rules.push(dark(_HP + " a.active, " + _HP + " a[aria-current], " + _HP + " a.on, " + _HP + " a.selected, " + _HP + " button.active, " + _HP + " button[aria-current], " + _HP + " button.on, " + _HP + " button.selected") + " { background-color:" + DARK.activeBg + " !important; color:" + DARK.activeFg + " !important; border-color:" + DARK.activeBg + " !important; }");
  rules.push("[data-pp-theme=\"light\"] " + _HP + " a.active, [data-pp-theme=\"light\"] " + _HP + " a[aria-current], [data-pp-theme=\"light\"] " + _HP + " a.on, [data-pp-theme=\"light\"] " + _HP + " a.selected, [data-pp-theme=\"light\"] " + _HP + " button.active, [data-pp-theme=\"light\"] " + _HP + " button[aria-current], [data-pp-theme=\"light\"] " + _HP + " button.on, [data-pp-theme=\"light\"] " + _HP + " button.selected { background-color:" + LIGHT.activeBg + " !important; color:" + LIGHT.activeFg + " !important; border-color:" + LIGHT.activeBg + " !important; }");
  // 子元素：底透明、字继承按钮色，避免整块同色吞字
  rules.push(dark(_HP + " a *, " + _HP + " button *") + " { background-color:transparent !important; }");
  rules.push("[data-pp-theme=\"light\"] " + _HP + " a *, [data-pp-theme=\"light\"] " + _HP + " button * { background-color:transparent !important; }");
  // footer 按钮：薄荷青底 #7FFFD4 + 花卉白字 #FFFAF0（跨主题常驻，不随色板变）
  var FOOTER_BG = "#7FFFD4", FOOTER_FG = "#FFFAF0", FOOTER_BG_HOVER = "#5fe3c0";
  rules.push(_HF + " { background-color:" + FOOTER_BG + " !important; color:" + FOOTER_FG + " !important; border-color:" + FOOTER_BG + " !important; border-radius:" + RADIUS + " !important; }");
  rules.push(_HF + " * { background-color:transparent !important; color:" + FOOTER_FG + " !important; }");
  rules.push(_HF + ":hover { background-color:" + FOOTER_BG_HOVER + " !important; color:" + FOOTER_FG + " !important; }");

  // B5. 搜索按钮内 i 图标灰 #696969（昼夜都灰）
  rules.push(HEADER_FORM_AREA + " > button > i,");
  rules.push(HEADER_FORM_BTN_ICON + " {");
  rules.push("  color:#696969 !important;");
  rules.push("  background-color:transparent !important;");
  rules.push("}");

  // B6. 主题切换按钮：昼夜都保持「黑夜配色」，做成一体化胶囊按钮
  // 挂载点自身即按钮本体，图标与文字是它内部的两个 inline-flex 子项，
  // 视觉上是一个整体，不分家。不被白天恢复逻辑影响。
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button {");
  rules.push("  display:inline-flex !important;");
  rules.push("  align-items:center !important;");
  rules.push("  justify-content:center !important;");
  rules.push("  flex-direction:row !important;");
  rules.push("  box-sizing:border-box !important;");
  rules.push("  gap:5px !important;");
  rules.push("  min-width:96px !important;");
  rules.push("  height:32px !important;");
  rules.push("  padding:0 12px !important;");
  rules.push("  margin:0 6px !important;");
  rules.push("  background-color:#000000 !important;");
  rules.push("  color:#ADD8E6 !important;");
  rules.push("  border:1px solid #2a2a2a !important;");
  rules.push("  border-radius:16px !important;");
  rules.push("  cursor:pointer !important;");
  rules.push("  font-size:13px !important;");
  rules.push("  font-weight:500 !important;");
  rules.push("  line-height:1 !important;");
  rules.push("  letter-spacing:.5px !important;");
  rules.push("  white-space:nowrap !important;");
  rules.push("  text-decoration:none !important;");
  rules.push("  outline:none !important;");
  rules.push("  visibility:visible !important;");
  rules.push("  opacity:1 !important;");
  rules.push("  pointer-events:auto !important;");
  rules.push("  -webkit-tap-highlight-color:transparent !important;");
  rules.push("  transition:background-color .2s ease, color .2s ease, border-color .2s ease, box-shadow .2s ease, transform .08s ease !important;");
  rules.push("}");
  // hover：浅黄底 + 黑字 + 柔和光晕
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button:hover {");
  rules.push("  background-color:#fde68a !important;");
  rules.push("  color:#0b1020 !important;");
  rules.push("  border-color:#fde68a !important;");
  rules.push("  box-shadow:0 0 10px 2px rgba(251,191,36,.40) !important;");
  rules.push("}");
  // 按压反馈
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button:active { transform:scale(.95) !important; }");
  // 焦点态（键盘可达）
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button:focus-visible {");
  rules.push("  border-color:#ADD8E6 !important;");
  rules.push("  box-shadow:0 0 0 2px rgba(173,216,230,.35) !important;");
  rules.push("}");
  // 内部图标 + 文字：与按钮本体同色，融为一体
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button > .pp-toggle-emoji,");
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button > .pp-toggle-text {");
  rules.push("  display:inline-block !important;");
  rules.push("  background-color:transparent !important;");
  rules.push("  color:inherit !important;");
  rules.push("  line-height:1 !important;");
  rules.push("  pointer-events:none !important;");
  rules.push("}");
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button > .pp-toggle-emoji { font-size:14px !important; }");
  rules.push("body > div.t-p > div.t-p-main > div.header > div.download-app-button > .pp-toggle-text { font-size:13px !important; }");

  // 防止重复注入：已存在同名 style 则直接替换内容
  var style = document.getElementById("pp-theme-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "pp-theme-style";
    style.setAttribute("data-pp", "theme");
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = rules.join("\n");
}

// ---------- 主题切换：黑夜 / 白天 ----------
// getTheme() 读当前主题；setTheme() 切换 <html data-pp-theme> 并持久化。
// 黑夜专属的内联兜底函数（forceWhiteText / forceHeaderFormAreaOrange /
// forceSearchResultBlack / paintMenuBase / forceSideMainButtonsBlack）在白天模式
// 下会自动跳过，让站点原生样式透出来；跨主题兜底（屏蔽元素、红图标、
// 历史弹层、搜索按钮灰图标、菜单选中金）昼夜都生效。
// 读取「应当使用的主题」：网址优先，用户手动选择其次。
// ① 先看当前网址（查询参数 / 域名黑白名单 / 映射表 / 默认）
// ② 网址未命中任何规则时，才回退到用户上次手动点击留下的 localStorage 记忆
// ③ 两者都没有 → 用 THEME_DEFAULT（白天）
// 之所以网址高于手动选择：打包给多个站点用，打开哪个网址就该听哪个网址的规则；
// 手动选择只在「网址无规则」的区间生效，避免 A 站点的黑夜记忆串到 B 站点。
function getTheme() {
  var byUrl = resolveThemeByUrl(window.location ? window.location.href : "");
  if (byUrl === THEME_DARK || byUrl === THEME_LIGHT) return byUrl;
  var saved = null;
  try { saved = window.localStorage ? window.localStorage.getItem(THEME_KEY) : null; } catch (e) {}
  if (saved === THEME_DARK || saved === THEME_LIGHT) return saved;
  return THEME_DEFAULT;
}

// 应用主题到 DOM：写 <html data-pp-theme> + 清/补内联兜底 + 更新按钮文案。
// 抽取成独立函数，供「点击切换」与「SPA 换页/网址变化」共用同一套逻辑。
function applyTheme(next, opts) {
  var isManual = !!(opts && opts.manual);
  var mode = (next === THEME_DARK) ? THEME_DARK : THEME_LIGHT;
  // 手动点击 → 把选择记进 localStorage（跨会话保留，仅作用于「网址无规则」的区间）
  if (isManual) {
    try { if (window.localStorage) window.localStorage.setItem(THEME_KEY, mode); } catch (e) {}
  }
  // 切主题时先清掉菜单按钮上的内联底色，否则旧主题的内联 !important
  // 会压住新主题的 CSS 规则，出现「切到白天还是黑底」或反之。
  try { clearMenuInline(); } catch (e) {}
  try { clearHistoryBoxInline(); } catch (e) {} // 历史弹层内联色一并清掉，按新主题重建
  if (document.documentElement) {
    document.documentElement.setAttribute("data-pp-theme", mode);
  }
  // 重建样式表：双主题色板都写在同一份 CSS 里，但通过属性选择器
  // [data-pp-theme="light"] 与 [data-pp-theme="dark"] 区分，切主题
  // 必须重新生成规则文本，只改属性值不会触发重绘。
  try { injectCSS(); } catch (e) {}
  if (mode === THEME_LIGHT) {
    clearNightInlineStyles();
  } else {
    runNightFallbacks();
  }
  updateToggleButtonLabel();
  // [FIX] 切主题后延迟重建菜单的兜底与事件绑定：白天侧的 forceSideMainButtonsBlack
  // 等函数内部有「白天不写内联」的早退逻辑，首次切换时并未执行；同时菜单 hover / active
  // 的事件绑定标记（__menuHoverBound / __menuBound）是永久的，不清除就无法重新绑定。
  // 延迟两个档位：50ms 等站点对菜单 DOM 的改写落地，400ms 再补一次兜底。
  setTimeout(rebuildAfterThemeSwitch, 50);
  setTimeout(rebuildAfterThemeSwitch, 400);
}

// 切换主题（由切换按钮调用）：总是与「当前显示的主题」相反，
// 并把结果记为用户手动选择，方便同一网址内临时翻转、刷新后仍然保持。
function setTheme(mode) {
  var isLight = (mode === THEME_LIGHT);
  applyTheme(isLight ? THEME_LIGHT : THEME_DARK, { manual: true });
}

// 主题切换的「二次重建」钩子。
// 背景：切到白天时，forceSideMainButtonsBlack / paintMenuBase 会因为
// "白天模式不写黑夜内联" 而直接 return，菜单按钮的内联底色从未被补上；
// 同时 bindMenuHover / bindMenuActiveState 的 __menuHoverBound / __menuBound
// 标记没清，导致点左侧按钮后事件监听器不重新绑定，新主题的 hover / 选中
// 三态全部失效。这里在切换完成后再跑一次 runOnce()，补齐白天侧的兜底与事件。
function rebuildAfterThemeSwitch() {
  try { paintMenuBase(); } catch (e) {}
  try { forceSideMainButtonsBlack(); } catch (e) {}
  try { forceWhiteText(); } catch (e) {}
  try { forceHeaderFormAreaOrange(); } catch (e) {}
  try { forceHeaderBtnIconGray(); } catch (e) {}
  try { forceSearchResultBlack(); } catch (e) {}
  try { forceSearchTipWhite(); } catch (e) {}
  try { forceHistoryBox(); } catch (e) {}
  try { bindMenuHover(); } catch (e) {}
  try { bindMenuActiveState(); } catch (e) {}
  try { bindGlowLongPress(); } catch (e) {}
  try { syncActive && syncActive(); } catch (e) {}
  try { ensureHomeActive(); } catch (e) {}
  try { ensureHiddenItem(); } catch (e) {}
}
// ---------- 主题属性守护：防止站点 SPA 在换页 / 弹层 / 播放页改写 <html> ----------
// 站点播放器或路由模块可能在运行时替换 html 元素的 class / data 属性，
// 导致 [data-pp-theme="dark"] 选择器集体失效，表现为「切页或点播放就退出黑夜」。
// 这里只保护 data-pp-theme 这一个属性，不干扰站点的其他 class 操作。
  // 防止站点在播放页 / 路由切换时把你注入的样式表一并移走或覆盖；
  // 同时检测网址变化：从黑夜网址跳到白天网址时，重建样式表 + 更新 data-pp-theme。
  var THEME_STYLE_ID = "pp-theme-style";
  var _lastThemeUrl = (window.location && window.location.href) || "";
  setInterval(function () {
    var st = document.getElementById(THEME_STYLE_ID);
    var want = getTheme();
    var now = (window.location && window.location.href) || "";
    var urlChanged = (now !== _lastThemeUrl);
    // 样式表被站点移除 / 主题或网址发生变化 → 重建
    if (!st || !st.textContent || st.textContent.length < 100 || urlChanged) {
      _lastThemeUrl = now;
      if (document.documentElement) document.documentElement.setAttribute("data-pp-theme", want);
      try {
        if (!st) {
          st = document.createElement("style");
          st.id = THEME_STYLE_ID;
          st.setAttribute("data-pp", "theme");
          (document.head || document.documentElement).appendChild(st);
        }
        // 重新写入规则（injectCSS 只跑一次，此处兜底重建）
        injectCSS();
      } catch (e) {}
    }
  }, 2000);



// ---------- 主题属性守护：防站点 SPA 改写 <html>，并按网址自动跟随 ----------
// 旧版把 data-pp-theme 钉死成首次读到的一个值，这在「多网址共享一份脚本」
// 的场景下会出问题：从黑夜网址跳到白天网址，属性被锁住，侧边栏始终黑。
// 现在改为：站点只能把属性改成「当前网址应得的主题」，其余值一律拒绝；
// 同时每 1 秒自检一次，网址变了就自动切换（覆盖 pushState / hash 换页）。
(function lockThemeAttr() {
  var html = document.documentElement;
  if (!html || typeof html.setAttribute !== "function") return;
  var origSet = html.setAttribute.bind(html);
  var origRemove = html.removeAttribute ? html.removeAttribute.bind(html) : null;

  // 本站脚本内部想要的值一律放行，站点的其他写入被矫正为正确主题
  var internalCall = false;
  function allow(next) { internalCall = true; try { html.setAttribute("data-pp-theme", next); } finally { internalCall = false; } }

  html.setAttribute = function (name, value) {
    if (name === "data-pp-theme") {
      if (internalCall) return origSet(name, value);
      // 外部改写：只允许设成「当前网址应得的主题」，其余忽略
      var want = getTheme();
      if (String(value) !== want) { allow(want); return; }
    }
    return origSet(name, value);
  };

  if (origRemove) {
    html.removeAttribute = function (name) {
      if (name === "data-pp-theme") { allow(getTheme()); return; }
      return origRemove(name);
    };
  }

  // 兜底轮询：网址变化（SPA pushState / hashchange / iframe）时自动换主题
  var lastUrl = (window.location && window.location.href) || "";
  setInterval(function () {
    var now = (window.location && window.location.href) || "";
    if (now !== lastUrl) { lastUrl = now; allow(getTheme()); }
    var cur = null;
    try { cur = html.getAttribute("data-pp-theme"); } catch (e) {}
    var want = getTheme();
    if (cur !== want) allow(want);
  }, 1000);
})();


// 清除黑夜专属的内联样式残留（白天模式调用）
// 只清本脚本写进去的黑夜属性，不动站点原生内联样式。
function clearNightInlineStyles() {
  var props = ["background-color", "background", "color", "border-color", "caret-color", "box-shadow"];
  // 全局文字/底色
  var all = document.querySelectorAll("body, body *");
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (!el || !el.style) continue;
    // 跨主题元素跳过：切换按钮本体、红图标、被屏蔽元素、历史弹层、菜单选中金
    if (el.closest && isCrossThemeElement(el)) continue;
    for (var p = 0; p < props.length; p++) {
      // 只清带 important 的（本脚本写入的），普通内联不动
      if (el.style.getPropertyPriority && el.style.getPropertyPriority(props[p]) === "important") {
        el.style.removeProperty(props[p]);
      }
    }
  }
}

// 判断元素是否属于「跨主题常驻」范围（昼夜都不该被白天恢复逻辑清掉）
function isCrossThemeElement(el) {
  if (!el || !el.closest) return false;
  if (el.closest(TOGGLE_BTN)) return true;                      // 切换按钮本体
  if (el.matches && (el.matches(MENU_ICON_RED) || el.matches(MENU_ICON_RED_A))) return true; // 红图标
  if (el.closest && el.closest(HIDDEN_SELECTORS.join(","))) return true; // 屏蔽元素
  if (el.closest && el.closest(HISTORY_POPUP)) return true;     // 历史弹层
  if (el.closest && el.closest(HISTORY_PANEL)) return true;
  if (el.closest && el.closest(HEADER_FORM_BTN_ICON)) return true; // 搜索按钮灰图标
  return false;
}

// 主题切换时，按新色板补一次内联兜底
function runNightFallbacks() {
  try { clearMenuInline(); } catch (e) {}       // 先清旧内联，避免残留压住新主题
  try { paintMenuBase(); } catch (e) {}
  try { forceSideMainButtonsBlack(); } catch (e) {}
  try { paintBlackContainers(); } catch (e) {}  // 需求一：侧边栏 + header 容器底色
  try { forceHeaderFormAreaOrange(); } catch (e) {}
  try { forceHeaderBtnIconGray(); } catch (e) {}
  try { forceSearchResultBlack(); } catch (e) {}
  try { forceSearchTipWhite(); } catch (e) {}
  try { forceHistoryBox(); } catch (e) {}
  try { forceWhiteText(); } catch (e) {}
}

// ---------- 主题切换按钮（挂在 download-app-button 位置）----------
// 原地替换该组件：把原组件内容清空，插入一个带「🌑黑夜模式 / ☀️白天模式」
// 文案+表情的按钮。点击切换主题。按钮本体昼夜都保持黑夜配色。
function buildToggleButton() {
  var host = document.querySelector(TOGGLE_BTN);
  if (!host) return false;
  // 已构建过则跳过
  if (host.querySelector(".pp-toggle-emoji")) return true;

  // 清空原组件内容（保留挂载点），挂载点自身即按钮本体
  host.textContent = "";

  // 给挂载点打标记，便于跨主题兜底识别
  host.setAttribute("data-pp-role", "theme-toggle");
  host.setAttribute("role", "button");
  host.setAttribute("tabindex", "0");
  host.style.setProperty("display", "inline-flex", "important");

  // 内部两个子项：图标 + 文字，视觉上融为一体（一体化胶囊按钮）
  var emoji = document.createElement("span");
  emoji.className = "pp-toggle-emoji";
  var text = document.createElement("span");
  text.className = "pp-toggle-text";

  host.appendChild(emoji);
  host.appendChild(text);

  // 点击切换（阻止站点对该原组件的其他点击逻辑）
  function toggle(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    var cur = getTheme();
    setTheme(cur === THEME_LIGHT ? THEME_DARK : THEME_LIGHT);
    return false;
  }
  host.addEventListener("click", toggle);
  // 键盘可达：回车 / 空格
  host.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      toggle(ev);
    }
  });

  updateToggleButtonLabel();
  return true;
}

// 根据当前主题更新按钮上的文案与表情
function updateToggleButtonLabel() {
  var host = document.querySelector(TOGGLE_BTN);
  if (!host) return;
  var emoji = host.querySelector(".pp-toggle-emoji");
  var text = host.querySelector(".pp-toggle-text");
  if (!emoji || !text) return;
  if (getTheme() === THEME_LIGHT) {
    emoji.textContent = "🌑";
    text.textContent = "黑夜模式";
  } else {
    emoji.textContent = "☀️";
    text.textContent = "白天模式";
  }
}

// ---------- 侧边栏菜单：选中态由站点标记驱动，CSS 控制三态 ----------
// 站点真实的菜单结构：
//   <li class="menu-item">                       <- 一个菜单项
//     <a href="/">
//       <div class="menu-item-icon"><i class="isax ..."></i></div>
//       <div class="menu-item-label">首页</div>
//     </a>
//   </li>
// 站点把「当前选中」标记挂在 <li> 上：  <li class="menu-item menu-item-active">
// 而 CSS 的选中态（金色底）是挂在 <a class="active"> 上的。
//
// 因此本模块唯一职责：把站点给 <li> 打的「menu-item-active」标记，
// 镜像成 <a> 上的「.active」，让 CSS 规则按当前主题色板自动生效。
// 这样「按钮选中后变黄」完全由站点自身的选中状态驱动，不会错位、不会长亮。
// 三态全部由 CSS 管理（默认黑底 / hover 柠檬色 / active 金色），JS 只负责镜像标记。
// 站点真实的菜单结构：
//   <li class="menu-item">                       <- 一个菜单项
//     <a href="/">
//       <div class="menu-item-icon"><i class="isax ..."></i></div>
//       <div class="menu-item-label">首页</div>
//     </a>
//   </li>
// 站点把「当前选中」标记挂在 <li> 上：  <li class="menu-item menu-item-active">
// 而 CSS 的选中态（金色底）是挂在 <a class="active"> 上的。
//
// 因此本模块唯一职责：把站点给 <li> 打的「menu-item-active」标记，
// 镜像成 <a> 上的「.active」，让 CSS 规则按当前主题色板自动生效。
// 这样「按钮选中后变黄」完全由站点自身的选中状态驱动，不会错位、不会长亮。
//
// 两个明确的用户需求：
//   (1) 指定组件选中时为黄色：
//       body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li.menu-item.menu-item-active
//   (2) 首页按钮默认选中，别的按钮选中时首页变回黑色。

// ===== 全局工具：首页默认选中 / 隐藏指定项 =====
// 这两个函数被 runOnce() 与 init() 的兜底定时器调用，必须在全局作用域可见
// （早期版本误将它们定义在 bindMenuActiveState 内部，导致外部调用抛
//  ReferenceError: ensureHiddenItem is not defined，脚本整体中断）。
function ensureHomeActive() {
  var ITEM_SEL = SIDE_MAIN + " ul li.menu-item";
  var ACTIVE_LI_SEL = SIDE_MAIN + " ul li.menu-item.menu-item-active";
  var HOME_GROUP_SEL = SIDE_MAIN + " > ul:nth-child(1)";
  var anyActive = document.querySelector(ACTIVE_LI_SEL);
  if (anyActive) return;
  var homeLi = document.querySelector(HOME_GROUP_SEL + " > li.menu-item");
  var homeAnchor = homeLi ? homeLi.querySelector(":scope > a") : null;
  if (!homeAnchor) return;
  homeAnchor.classList.add("active");
  homeAnchor.setAttribute("data-pp-active", "true");
}

function ensureHiddenItem() {
  var HIDDEN_ITEM_SEL = "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(6)";
  var h = document.querySelector(HIDDEN_ITEM_SEL);
  if (h && h.style.display !== "none") {
    h.style.setProperty("display", "none", "important");
  }
}

function bindMenuActiveState() {
  // 站点侧边栏菜单中所有「菜单项」<li class="menu-item">
  var ITEM_SEL = SIDE_MAIN + " ul li.menu-item";
  // 站点标记的「当前选中」项（唯一真相源）
  var ACTIVE_LI_SEL = SIDE_MAIN + " ul li.menu-item.menu-item-active";
  // 整个侧边栏内的所有 <a>（用于「全量清除旧选中」）
  var SIDE_ALL_A = SIDE_MAIN + " a";
  // 第 5 组选中项 <a> 的完整锚定选择器（选中态强制金色）
  var MENU5_ACTIVE_A_SEL =
    "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li.menu-item.menu-item-active > a";

  // 首页锚点：ul:nth-child(1) > li.menu-item 内第一个 <a>
  var HOME_GROUP_SEL =
    "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(1)";
  var homeLi = document.querySelector(HOME_GROUP_SEL + " > li.menu-item");
  var homeAnchor = homeLi ? homeLi.querySelector(":scope > a") : null;

  // 需要隐藏的项：ul:nth-child(5) > li:nth-child(6)
  var HIDDEN_ITEM_SEL =
    "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(5) > li:nth-child(6)";

  // 核心：全量镜像
  // 站点对「哪个 li 是当前选中」有唯一权威标记（menu-item-active），
  // 我们做的事情非常简单：
  //   - 先把整个侧边栏所有 <a> 的旧 .active 清掉；
  //   - 再把所有带 menu-item-active 的 <li> 的直接子 <a> 标成 .active。
  // 由于「li 内只能有一个是当前选中」，这就天然实现了「分组内互斥」，
  // 也天然实现了「别的按钮选中时首页自动变黑」——因为首页那个 li 不再带 menu-item-active。
  function mirrorActive() {
    // [FIX] 全量镜像：清除旧选中 → 按站点标记 li.menu-item-active 同步到 a.active
    var allA = document.querySelectorAll(SIDE_ALL_A);
    for (var i = 0; i < allA.length; i++) {
      allA[i].classList.remove("active");
      allA[i].removeAttribute("data-pp-active");
      // [FIX] 清掉早期兜底写死的内联金底，否则这条内联 !important 会压死 CSS 过渡动画，
      //       且换页时旧选中项的内联色残留，看起来像"金色不消失"。
      allA[i].style.removeProperty("background-color");
      allA[i].style.removeProperty("color");
    }
    var activeLis = document.querySelectorAll(ACTIVE_LI_SEL);
    for (var k = 0; k < activeLis.length; k++) {
      var a = activeLis[k].querySelector(":scope > a");
      if (!a) continue;
      a.classList.add("active");
      a.setAttribute("data-pp-active", "true");
    }
    // [FIX] 第 5 组额外内联金色整段删除：它正是"金色选中态变不回来"的元凶。
    //       金色现由 [FIX 3] 的 CSS 选择器 + a.active 规则双重保证，不依赖内联。
  }


  // 统一入口
  function syncActive() {
    mirrorActive();
    ensureHomeActive();
    ensureHiddenItem();
  }

  // 点击按钮：不阻止默认行为，让站点自己处理跳转和选中标记。
  // 站点通常会立即给对应的 <li> 打上 menu-item-active，
  // 下一次 mirrorActive() 就会把它同步到 <a>，按钮自然变黄。
  // 这里仅做一次即时镜像，让视觉反馈没有延迟。
  function bind(el) {
    if (el.__menuBound) return;
    el.__menuBound = true;
    el.addEventListener("click", function () {
      // 给被点击的 <li> 立即打上选中标记（模拟站点行为），
      // 下一轮 400ms 兜底若站点也打了，则完全一致；若站点没打，兜底会清掉（符合站点逻辑）。
      var li = el.closest("li.menu-item");
      if (li) {
        // 同一组内互斥：先把兄弟项清掉，再标自己
        var ul = li.closest("ul");
        if (ul) {
          var sibs = ul.querySelectorAll("li.menu-item");
          for (var s = 0; s < sibs.length; s++) {
            sibs[s].classList.remove("menu-item-active");
          }
        }
        li.classList.add("menu-item-active");
        el.classList.add("active");
        el.setAttribute("data-pp-active", "true");
      }
    });
  }

  function scan() {
    var items = document.querySelectorAll(ITEM_SEL);
    for (var i = 0; i < items.length; i++) {
      var a = items[i].querySelector(":scope > a");
      if (a) bind(a);
    }
  }

  // 初始化：只跑一次同步 + 扫描
  syncActive();
  scan();

  // 【关键改动】彻底移除 MutationObserver 与 400ms 定时兜底。
  // 它们会反复调用 mirrorActive() → 全量 removeProperty / setProperty，
  // 直接引发「按钮文字闪烁」。兜底职责已上移到 init() 的 600ms 单次扫描
  // + 路由/pushState/hashchange 事件触发，覆盖所有换页场景。
}

// 监听路由变化（SPA hash 路由 & pushState），重新同步选中态
function restoreActiveState() {
  // 路由变化后重新同步菜单选中态。
  // bindMenuActiveState 内部已有 MutationObserver + setInterval(400ms) 兜底，
  // 这里额外再触发一次全量镜像，确保「pushState 换页但不改 DOM」时选中态也能即时更新。
  function apply() {
    // 全量镜像：清除侧边栏所有旧选中，只保留 li.menu-item-active 里的项为金色
    var SIDE_ALL_A = "body > div.t-p > div.t-p-side a";
    var ACTIVE_LI =
      "body > div.t-p > div.t-p-side li.menu-item.menu-item-active";
    var allA = document.querySelectorAll(SIDE_ALL_A);
    for (var i = 0; i < allA.length; i++) {
      allA[i].classList.remove("active");
      allA[i].removeAttribute("data-pp-active");
    }
    var activeLis = document.querySelectorAll(ACTIVE_LI);
    for (var k = 0; k < activeLis.length; k++) {
      var a = activeLis[k].querySelector(":scope > a");
      if (a) {
        a.classList.add("active");
        a.setAttribute("data-pp-active", "true");
      }
    }
    // 若站点没认定任何选中项，则默认选中首页
    if (activeLis.length === 0) {
      var homeLi = document.querySelector(
        "body > div.t-p > div.t-p-side > div > div.main > ul:nth-child(1) > li.menu-item"
      );
      if (homeLi) {
        var ha = homeLi.querySelector(":scope > a");
        if (ha) {
          ha.classList.add("active");
          ha.setAttribute("data-pp-active", "true");
        }
      }
    }
  }
  // hash 路由
  window.addEventListener("hashchange", function () { setTimeout(apply, 50); });
  // pushState / replaceState 路由（SPA 常用）
  var _push = history.pushState;
  var _replace = history.replaceState;
  if (_push) {
    history.pushState = function () {
      _push.apply(history, arguments);
      setTimeout(apply, 50);
    };
  }
  if (_replace) {
    history.replaceState = function () {
      _replace.apply(history, arguments);
      setTimeout(apply, 50);
    };
  }
  window.addEventListener("popstate", function () { setTimeout(apply, 50); });
}

// ---------- 默认态兜底：仅在站点运行时破坏了容器底色时按主题补一次 ----------
// 【关键】本函数只修补「侧边栏容器本体」的底色，绝不触碰任何菜单按钮 <a>。
// 旧版会遍历容器全部子元素并写入内联 background-color，这会把按钮的 hover /
// 选中态内联死（内联 !important 压过 CSS，transition 也无法插值），正是
// 「选中金色态被盖住」和「hover 不流畅」的根源。现改为完全跳过 SIDE_MAIN
// 内的菜单按钮，让按钮三态由纯 CSS 规则驱动。
// ---------- 需求一（内联兜底）：侧边栏 + header 容器底色 ----------
function paintBlackContainers() {
  if (!document.body) return;
  var P = palette();
  var hosts = document.querySelectorAll(BLACK_CONTAINERS.join(","));
  for (var g = 0; g < hosts.length; g++) {
    var host = hosts[g];
    // 若当前是白天、且此容器正好处于侧边栏，则还原站点原生底色，不抢色
    if (getTheme() === THEME_LIGHT && host.closest && host.closest(SIDE_MAIN)) continue;
    host.style.setProperty("background-color", P.container, "important");
    host.style.setProperty("background-image", "none", "important");
    host.style.setProperty("color", P.fg, "important");
    var kids = host.querySelectorAll("*");
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      // 核心：菜单按钮三态由 CSS 全权管理，任何内联底色都会破坏过渡与选中态
      if (el.closest && el.closest(SIDE_MAIN + " ul > li > a")) continue;
      // 红底白字图标独立管理，不被容器底色覆盖
      if (el.closest && el.closest(MENU_ICON_RED_A)) continue;
      // 站点原生组件内部：尽量不破坏，只补明显露白的区域
      el.style.setProperty("background-color", P.container, "important");
      el.style.setProperty("background-image", "none", "important");
    }
  }
}

// 菜单默认态兜底：白天模式按白底补色；黑夜模式按黑底补色。
// 只在「确实没底色」且「非选中/非 hover」时写一次内联样式，
// 并同步 data-pp-painted 标记，下次不再重复写入，避免反复覆盖 CSS 过渡。
function paintMenuBase() {
  if (!document.body) return;
  var P = palette();
  var nodes = document.querySelectorAll(SIDE_MAIN + " ul > li > a");
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    if (el.classList.contains("active") || el.getAttribute("data-pp-active") === "true") continue;
    if (el.matches && el.matches(":hover")) continue;
    var cs = el.currentStyle || (window.getComputedStyle ? window.getComputedStyle(el) : null);
    var bg = cs ? (cs.backgroundColor || cs.background || "") : "";
    // 已有有效底色（非透明、非继承的 transparent/none）→ 不覆盖
    if (bg && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent|none|initial|inherit/i.test(bg)) continue;
    el.style.setProperty("background-color", P.bg, "important");
    el.style.setProperty("color", P.fg, "important");
    el.style.setProperty("border-color", P.border, "important");
    el.setAttribute("data-pp-painted", "true");
  }
}

// ---------- 选中态强制金色兜底（防站点运行时改样式覆盖）----------
// ---------- 屏蔽表单自动填充（需求五）----------
function disableAutofill() {
  function patchFields(root) {
    var fields = root.querySelectorAll ? root.querySelectorAll(AUTOFILL_FIELDS.join(",")) : [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.__patched) continue;
      f.__patched = true;
      f.setAttribute("autocomplete", "off");
      f.setAttribute("data-form-type", "other");
      try { f.setAttribute("autofill", "off"); } catch (e) {}
      f.addEventListener("focus", function (e) {
        try { e.target.setAttribute("autocomplete", "off"); } catch (err) {}
      });
    }
  }
  patchFields(document);

  document.addEventListener("focusin", function (e) {
    var el = e.target;
    if (el && el.matches && el.matches(AUTOFILL_FIELDS.join(","))) {
      el.setAttribute("autocomplete", "off");
    }
  }, true);

  try {
    var forms = document.querySelectorAll("form");
    for (var f = 0; f < forms.length; f++) {
      forms[f].setAttribute("autocomplete", "off");
      forms[f].setAttribute("data-autocomplete", "off");
    }
  } catch (e) {}

  // [已移除] MutationObserver 兜底：它对动态插入的输入框做补丁，
  // 但会持续触发回流，与本脚本其他兜底相互打架，是闪烁的放大器。
  // 表单兜底仅在 runOnce() 时执行一次；如需支持运行时新增输入框，
  // 由 disableAutofill() 顶部的 __patched 标记保证幂等。
}

// ---------- 需求七：长按停留也触发光圈 ----------
function bindGlowLongPress() {
  var selectors = GLOW_SELECTORS.join(",");
  function bind(el) {
    if (el.__glowBound) return;
    el.__glowBound = true;
    var timer = null;
    var start = function () { timer = setTimeout(function () { el.classList.add("pp-glow-on"); }, 400); };
    var end   = function () { clearTimeout(timer); el.classList.remove("pp-glow-on"); };
    el.addEventListener("mousedown", start);
    el.addEventListener("mouseup",   end);
    el.addEventListener("mouseleave", end);
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend",   end);
    el.addEventListener("touchcancel", end);
  }
  function scan() {
    var nodes = document.querySelectorAll(selectors);
    for (var i = 0; i < nodes.length; i++) bind(nodes[i]);
  }
  scan();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 需求八：指定按钮兜底 —— 持续锁定「选中金 / hover 浅黄 / 默认黑底白字 / 圆角」四态 ----------

// ---------- 需求八：div.main 内按钮 —— 黑底白字 / hover 浅黄 / 选中金色 / 圆角 ----------
/*
 * 三态：默认底配字色 / hover 对位浅色 / 选中对位强调色（色值由 DARK / LIGHT 色板驱动）
 * 选中态完全由本脚本自己管理（data-pp-active），不再依赖站点 class，
 * 所以站点在路由变化时怎么改 .active 都影响不到我们的金色高亮。
 */
function keepSideMainOriginal() {
  // 该函数已停用：div.main 内的按钮恢复为站点原生样式。
  // 仅清理历史注入的内联样式残留，让站点默认外观正常显示。
  var PROPS = ["background", "background-color", "color", "border-radius"];
  function clear(el) {
    for (var p = 0; p < PROPS.length; p++) {
      try { el.style.removeProperty("background"); } catch (e) {}
      try { el.style.removeProperty("background-color"); } catch (e) {}
      try { el.style.removeProperty("color"); } catch (e) {}
      try { el.style.removeProperty("border-radius"); } catch (e) {}
    }
    el.removeAttribute("data-pp-active");
  }
  var mains = document.querySelectorAll(SIDE_MAIN);
  for (var g = 0; g < mains.length; g++) {
    var host = mains[g];
    clear(host);
    var list = host.querySelectorAll("a, button, *");
    for (var i = 0; i < list.length; i++) clear(list[i]);
  }
}

// ---------- 需求四兜底：全局文字 = 淡蓝 #ADD8E6（持续生效）----------
function forceWhiteText() {
  // 全局淡蓝字：遍历整个文档，把被站点内联样式覆盖的文字强制回淡蓝色。
  // 菜单 a 的三态（黑底淡蓝 / hover 浅黄 / active 金色）由 CSS 优先级压制，不受影响。
  // 红色图标（MENU_ICON_RED）明确跳过，保持红底白字。
  function apply() {
    if (!document.body) return;
    // 白天模式：不写黑夜内联样式，让站点原生外观透出来
    if (getTheme() === THEME_LIGHT) return;
    var all = document.querySelectorAll("body, body *");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      // 红色图标保持自己的配色，不参与全局淡蓝覆盖
      if (el.matches && (el.matches(MENU_ICON_RED) || el.matches(MENU_ICON_RED_A))) continue;
      // 搜索区（form > div）已有专属淡蓝字规则，跳过全局覆盖
      if (el.closest && el.closest(HEADER_FORM_AREA)) continue;
      // 菜单 a 及其子元素完全由 CSS 三态规则管理（默认黑底 / hover 浅黄 / active 金色），
      // 全局文字覆盖一律不碰，避免内联 color 压过 :hover 和 :active。
      if (el.closest && el.closest(MENU_UL_ALL)) continue;
      // div.main 内所有按钮由 forceSideMainButtonsBlack 强制管理（默认黑底 / hover 浅黄 / active 金色），
      // 全局文字覆盖一律不碰。
      if (el.closest && el.closest(SIDE_MAIN)) continue;
      // div.main 容器本身白字由专属规则处理，不在此覆盖
      if (el.matches && el.matches(SIDE_MAIN)) continue;
      if (!el.__whiteDone) {
        el.style.setProperty("color", FG, "important");
        el.__whiteDone = true;
      }
    }
  }
  apply();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 需求十一兜底：header 搜索区纯黑底 #000 + 淡蓝字 #ADD8E6（持续生效）----------
function forceHeaderFormAreaOrange() {
  function apply() {
    // 白天模式：不写黑夜内联样式，让站点原生样式透出来
    if (getTheme() === THEME_LIGHT) return;
    var area = document.querySelectorAll(HEADER_FORM_AREA);
    for (var a = 0; a < area.length; a++) {
      area[a].style.setProperty("background-color", "#000000", "important");
      area[a].style.setProperty("color", "#ADD8E6", "important");
      area[a].style.setProperty("border-color", "#000000", "important");
      var inputs = area[a].querySelectorAll("input");
      for (var i = 0; i < inputs.length; i++) {
        // 纯黑底上无边界可见，用略亮一档的深灰 #1a1a1a 做底形成边界
        inputs[i].style.setProperty("background-color", "#1a1a1a", "important");
        inputs[i].style.setProperty("color", "#ADD8E6", "important");
        inputs[i].style.setProperty("caret-color", "#ADD8E6", "important");
        inputs[i].style.setProperty("border-color", "#ADD8E6", "important");
      }
      var all = area[a].querySelectorAll("*");
      for (var k = 0; k < all.length; k++) {
        // 按钮内的 i 图标由下方 forceHeaderBtnIconGray 单独管理，这里跳过
        if (all[k].matches && all[k].matches(HEADER_FORM_BTN_ICON)) continue;
        all[k].style.setProperty("color", "#ADD8E6", "important");
      }
    }
  }
  apply();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 需求十二兜底：搜索按钮内 i 图标强制灰色 #696969（持续生效）----------
function forceHeaderBtnIconGray() {
  function apply() {
    // 白天模式：不写内联样式，站点原生样式透出来
    if (getTheme() === THEME_LIGHT) return;
    var nodes = document.querySelectorAll(HEADER_FORM_BTN_ICON);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.style.setProperty("color", "#696969", "important");
      el.style.setProperty("background-color", "transparent", "important");
    }
  }
  apply();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 需求十五兜底：header 历史记录弹层 —— 昼夜统一黑底 + 按钮三态 ----------
// 该弹层由站点动态插入/切换显示，须持续兜底：本体锁纯黑底(#000)+淡蓝字(#ADD8E6)，
// 内部 a / button 三态圆角（色值由 DARK / LIGHT 色板驱动），昼夜均生效。
// 弹层本体与内部按钮均不被 forceWhiteText / forceSearchResultBlack 等其他规则侵入。
//
// 关键约束（早期版本踩过的坑，此处已修正）：
//  1) 子元素（图标 <i> / 文字 <span>）绝不复写 background-color，只继承按钮文字色。
//     旧版给 kkids 铺 activeBg，导致选中按钮内部的字被同色底吞掉、看起来像"整块黄"。
//  2) 选中态文字色只用 palette().activeFg 一次，不重复写死 #000。
//     旧版连写两次 color（先 activeFg 再 #000），白天 palette() 返回蓝底白字时被误覆盖。
//  3) 白天模式不再早退：历史弹层昼夜统一黑底，由主题色板决定按钮强调色（金 / 蓝）。
function forceHistoryBox() {
  function apply() {
    if (!document.body) return;
    // 按当前主题取色板：黑夜=琥珀金，白天=蓝
    var P = palette();
    // 浮层根节点（history-box > div）随主题上色，压过站点浅灰背景
    var panels = document.querySelectorAll(HISTORY_PANEL);
    for (var p = 0; p < panels.length; p++) {
      panels[p].style.setProperty("background-color", P.bg, "important");
      panels[p].style.setProperty("color", P.fg, "important");
      panels[p].style.setProperty("border-color", P.border, "important");
    }
    var boxes = document.querySelectorAll(HISTORY_POPUP);
    for (var b = 0; b < boxes.length; b++) {
      var box = boxes[b];
      // 弹层本体：跟主题色板走（昼夜一致的逻辑，值随主题变）
      box.style.setProperty("background-color", P.bg, "important");
      box.style.setProperty("color", P.fg, "important");
      box.style.setProperty("border-color", P.border, "important");
      var btns = box.querySelectorAll("a, button");
      for (var i = 0; i < btns.length; i++) {
        var btn = btns[i];
        // 选中态：色板强调色底 + 对应文字色，只写一次
        if (btn.classList.contains("active") || btn.classList.contains("on") || btn.classList.contains("selected") || btn.hasAttribute("aria-current")) {
          btn.style.setProperty("background-color", P.activeBg, "important");
          btn.style.setProperty("color", P.activeFg, "important");
          btn.style.setProperty("border-color", P.activeBg, "important");
          btn.style.setProperty("border-radius", RADIUS, "important");
          // 子元素：底透明继承、字继承按钮强调色，不再铺满底色
          var kkids = btn.children;
          for (var k3 = 0; k3 < kkids.length; k3++) {
            kkids[k3].style.setProperty("background-color", "transparent", "important");
            kkids[k3].style.setProperty("color", P.activeFg, "important");
          }
          continue;
        }
        // hover 中交给 CSS 过渡管理，此处不写死，避免压住 hover 变色
        if (btn.matches && btn.matches(":hover")) continue;
        // 默认态：色板底配字色 + 圆角
        btn.style.setProperty("background-color", P.bg, "important");
        btn.style.setProperty("color", P.fg, "important");
        btn.style.setProperty("border-color", P.border, "important");
        btn.style.setProperty("border-radius", RADIUS, "important");
        // 子元素：底透明、字继承，不被站点浅色内联覆盖
        var kids = btn.children;
        for (var k = 0; k < kids.length; k++) {
          kids[k].style.setProperty("background-color", "transparent", "important");
          kids[k].style.setProperty("color", P.fg, "important");
        }
      }
    }
    // his-popup-box-footer 按钮：薄荷青底 #7FFFD4 + 花卉白字 #FFFAF0（跨主题常驻）
    var foots = document.querySelectorAll(HISTORY_FOOTER_A);
    for (var f = 0; f < foots.length; f++) {
      var ft = foots[f];
      ft.style.setProperty("background-color", "#7FFFD4", "important");
      ft.style.setProperty("color", "#FFFAF0", "important");
      ft.style.setProperty("border-color", "#7FFFD4", "important");
      ft.style.setProperty("border-radius", RADIUS, "important");
      var fkids = ft.children;
      for (var fk = 0; fk < fkids.length; fk++) {
        fkids[fk].style.setProperty("background-color", "transparent", "important");
        fkids[fk].style.setProperty("color", "#FFFAF0", "important");
      }
    }
  }
  // hover 态由 CSS 负责（离开自动熄灭），此处只保证非 hover 时底色正确
  apply();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 需求十四兜底：搜索结果页顶部提示条 —— 黑底 #000 + 淡蓝字 #ADD8E6 ----------
// 提示条位于结果页主区内，会被 forceSearchResultBlack 染成淡蓝字，
// 这里再锁一次以防被其他规则覆盖；同时把提示条底色锁成纯黑，压过站点的浅灰背景。
function forceSearchTipWhite() {
  var TIP_KEYWORDS = ["tip", "Tip", "count", "Count", "search-tip", "searchTip", "tip-count"];
  function apply() {
    // 白天模式：不写内联样式，站点原生样式透出来
    if (getTheme() === THEME_LIGHT) return;
    if (!document.body) return;
    var area = document.querySelectorAll(SEARCH_RESULT_AREA);
    for (var a = 0; a < area.length; a++) {
      var all = area[a].querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var cn = (el.className && el.className.toString && el.className.toString()) || "";
        var hit = false;
        for (var k = 0; k < TIP_KEYWORDS.length; k++) {
          if (cn.indexOf(TIP_KEYWORDS[k]) !== -1) { hit = true; break; }
        }
        if (!hit) continue;
        // 自下而上找到提示条本体（含 class 关键词的最近祖先），统一黑底白字
        var target = el;
        while (target && target !== area[a]) {
          var tcn = (target.className && target.className.toString && target.className.toString()) || "";
          var tHit = false;
          for (var k2 = 0; k2 < TIP_KEYWORDS.length; k2++) {
            if (tcn.indexOf(TIP_KEYWORDS[k2]) !== -1) { tHit = true; break; }
          }
          if (tHit) {
            target.style.setProperty("background-color", "#000000", "important");
            target.style.setProperty("color", "#ADD8E6", "important");
            var kids = target.querySelectorAll("*");
            for (var j = 0; j < kids.length; j++) {
              kids[j].style.setProperty("background-color", "transparent", "important");
              kids[j].style.setProperty("color", "#ADD8E6", "important");
            }
            break;
          }
          target = target.parentElement;
        }
      }
    }
  }
  apply();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 需求十三兜底：搜索结果页 —— 黑底 #000 + 淡蓝字 #ADD8E6（持续生效）----------
// 结果页主区锁黑底（站点浅底不能透出来），文字统一淡蓝，
// 压过站点动态插入的内联样式覆盖。
// 侧边栏与 header 另有专属配色，结果页不侵入这两个区；
// 卡片信息块、搜索提示条另有专用规则，此处跳过。
function forceSearchResultBlack() {
  function apply() {
    // 白天模式：不写黑夜内联样式，让站点原生样式透出来
    if (getTheme() === THEME_LIGHT) return;
    if (!document.body) return;
    var area = document.querySelectorAll(SEARCH_RESULT_AREA);
    for (var a = 0; a < area.length; a++) {
      // 结果页主区锁黑底（站点浅底不能透出来）
      area[a].style.setProperty("background-color", "#000000", "important");
      var all = area[a].querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        // 侧边栏与 header 另有专属配色，结果页不侵入这两个区
        if (all[i].closest && all[i].closest(BLACK_CONTAINERS.join(","))) continue;
        var cn = (all[i].className && all[i].className.toString && all[i].className.toString()) || "";
        // 卡片信息块：本轮改为黑底 + 淡蓝字，与其他区域保持一致
        if (cn.indexOf("info") !== -1 || cn.indexOf("Info") !== -1) {
          all[i].style.setProperty("background-color", "#000000", "important");
          all[i].style.setProperty("color", "#ADD8E6", "important");
          continue;
        }
        // 搜索提示条由 forceSearchTipWhite 单独处理，此处不重复染色
        if (cn.indexOf("tip") !== -1 || cn.indexOf("Tip") !== -1 || cn.indexOf("count") !== -1) continue;
        // 其余文字：淡蓝 #ADD8E6
        all[i].style.setProperty("color", "#ADD8E6", "important");
      }
    }
  }
  apply();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 兜底：div.main 内按钮默认态补色（持续生效）----------
// 只补「确实没底色」的项，绝不覆盖 CSS 已管好的 hover / active 过渡动画。
// ---------- 兜底：div.main 内按钮默认态补色（按主题，只补一次）----------
// 作用：站点通过 JS 把按钮底色改回浅色/透明时，按当前色板补回默认态。
// 关键约束：
//  1) 选中态（.active / data-pp-active）和 hover 中一律跳过，绝不写内联底色，
//     否则会压住 CSS 的过渡动画，表现为「选中态被盖住 / hover 卡顿」。
//  2) 元素已有有效底色时不重复写入，避免 MutationObserver 无限循环。
//  3) 换主题时由 clearMenuInline() 先清掉旧内联，再由本函数按新色板重写。
function forceSideMainButtonsBlack() {
  function apply() {
    if (!document.body) return;
    var P = palette();
    var btns = document.querySelectorAll(SIDE_MAIN + " ul > li > a");
    for (var i = 0; i < btns.length; i++) {
      var el = btns[i];
      // 第 5 组第一个按钮（红底图标）有独立三态规则，绝不写内联覆盖
      if (el.closest && el.closest(MENU_ICON_RED_A)) continue;
      // 选中态 / hover 态交给 CSS 管理，内联一律不动
      if (el.classList.contains("active") || el.getAttribute("data-pp-active") === "true") continue;
      if (el.matches && el.matches(":hover")) continue;
      // 已有有效底色 → 不再覆盖（避免抢掉站点原生白底，也避免反复触发 MutationObserver）
      var cs = el.currentStyle || (window.getComputedStyle ? window.getComputedStyle(el) : null);
      var bg = cs ? (cs.backgroundColor || cs.background || "") : "";
      if (bg && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent|none|initial|inherit/i.test(bg)) continue;
      el.style.setProperty("background-color", P.bg, "important");
      el.style.setProperty("color", P.fg, "important");
      el.style.setProperty("border-color", P.border, "important");
      el.setAttribute("data-pp-painted", "true");
    }
  }
  apply();
  // [已移除] MutationObserver 持续兜底 —— 它是按钮文字闪烁的直接原因；
  // 现改为仅 runOnce() 执行一次 + 600ms 单次扫描 + 路由/pushState 事件触发。
}

// ---------- 侧边栏按钮 hover 按主题色板变色 ----------
// 问题背景：forceSideMainButtonsBlack / forceHistoryBox 给按钮写的是内联
// background-color（带 !important），内联优先级高于样式表里的 :hover 规则，
// 导致鼠标划过时 hover 样式被压住、视觉上"没有颜色变化"。
// 这里改为：mouseenter 时按当前主题色板改写 hover 色，mouseleave 时清除内联、
// 交还 CSS 默认态管理（包括选中态），实现平滑过渡。
function bindMenuHover() {
  var MENU_A = SIDE_MAIN + " ul > li > a";
  function paint(el, P) {
    el.style.setProperty("background-color", P.hoverBg, "important");
    el.style.setProperty("color", P.hoverFg, "important");
    el.style.setProperty("border-color", P.hoverBg, "important");
    el.style.setProperty("box-shadow", "0 2px 10px " + hexToRgba(P.hoverBg, .28), "important");
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].style.setProperty("background-color", "transparent", "important");
      kids[i].style.setProperty("color", P.hoverFg, "important");
    }
  }
  function clear(el) {
    // 清掉 hover 内联，交还 CSS：若此时处于选中态则由 CSS .active 规则接管
    el.style.removeProperty("background-color");
    el.style.removeProperty("color");
    el.style.removeProperty("border-color");
    el.style.removeProperty("box-shadow");
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].style.removeProperty("background-color");
      kids[i].style.removeProperty("color");
    }
  }
  function bind(el) {
    if (el.__menuHoverBound) return;
    el.__menuHoverBound = true;
    el.addEventListener("mouseenter", function () {
      // 选中态不参与 hover 变色，保持强调色
      if (el.classList.contains("active") || el.getAttribute("data-pp-active") === "true") return;
      paint(el, palette());
    });
    el.addEventListener("mouseleave", function () {
      clear(el);
    });
  }
  var els = document.querySelectorAll(MENU_A);
  for (var i = 0; i < els.length; i++) bind(els[i]);
}

// 清掉本脚本写给菜单按钮的内联底色/文字/描边，让白天模式切回黑夜、或黑夜切白天时
// CSS 规则能重新接管。仅清带 !important 的项（即本脚本写入的），站点原生内联不动。
function clearHistoryBoxInline() {
  if (!document.body) return;
  var props = ["background-color", "background", "color", "border-color", "border-radius", "box-shadow"];
  var els = document.querySelectorAll(HISTORY_PANEL + ", " + HISTORY_POPUP + ", " + HISTORY_FOOTER_A + ", " + HISTORY_POPUP + " *");
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.classList && el.classList.contains("pp-toggle-emoji")) continue;
    if (el.classList && el.classList.contains("pp-toggle-text")) continue;
    for (var p = 0; p < props.length; p++) {
      if (el.style.getPropertyPriority && el.style.getPropertyPriority(props[p]) === "important") {
        el.style.removeProperty(props[p]);
      }
    }
  }
}

function clearMenuInline() {
  if (!document.body) return;
  var props = ["background-color", "background", "color", "border-color", "border-radius", "box-shadow"];
  var els = document.querySelectorAll(SIDE_MAIN + " ul > li > a");
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    el.removeAttribute("data-pp-painted");
    // [FIX] 清除事件绑定标记，让切主题后 bindMenuHover / bindMenuActiveState 能重新
    //       为按钮绑定 hover 与点击选中逻辑；否则标记永久存在，新主题三态全部失效。
    try { el.__menuHoverBound = false; } catch (e) {}
    try { el.__menuBound = false; } catch (e) {}
    // [FIX] 清除点击瞬间写入的 data-pp-active 与 .active，交还给 CSS 与站点选中标记管理，
    //       避免切主题后旧选中态的内联色残留压住新主题的选中色。
    if (el.getAttribute("data-pp-active") === "true") {
      el.removeAttribute("data-pp-active");
    }
    for (var p = 0; p < props.length; p++) {
      if (el.style.getPropertyPriority && el.style.getPropertyPriority(props[p]) === "important") {
        el.style.removeProperty(props[p]);
      }
    }
  }
}

// ---------- 主流程 ----------
function runOnce() {
  buildToggleButton();    // 主题切换按钮（挂 download-app-button 位置，昼夜都黑）
  bindMenuActiveState(); // 菜单点击=选中，正常跳转
  restoreActiveState();    // 路由变化后重新同步选中态
  paintMenuBase();       // 默认态强制纯黑底兜底（白天模式内部自动跳过）
    paintBlackContainers();       // 需求一：侧边栏 + header 纯黑兜底（600ms 巡检）
  disableAutofill();    // 需求五：屏蔽自动填充
  bindGlowLongPress();  // 需求七：长按光圈
  forceWhiteText();             // 需求四：全局白字兜底（白天模式内部自动跳过）
  forceHeaderFormAreaOrange();   // 需求十一：搜索区浅灰底 + 橙字兜底（白天模式内部自动跳过）
  forceHeaderBtnIconGray();      // 需求十二：搜索按钮 i 图标灰字兜底（白天模式内部自动跳过）
  forceSearchResultBlack();       // 需求十三：搜索结果页杏色字 #ADD8E6 + 黑底 #000（白天模式内部自动跳过）
  forceSearchTipWhite();           // 需求十四：搜索结果页提示条白字兜底
  forceHistoryBox();               // 需求十五：历史记录弹层 昼夜黑底 + 按钮三态
  forceSideMainButtonsBlack();    // div.main 内按钮默认态纯黑底兜底（白天模式内部自动跳过）
  bindMenuHover();                // 侧边栏按钮 hover 按主题色板变色（修复 hover 无反应）
  ensureHiddenItem();              // 隐藏 ul:nth-child(5) > li:nth-child(6)
}

function init() {
  injectCSS();          // 样式表只注入一次，不重复
  runOnce();            // 绑定事件 + 内联兜底（首次）
  // 延迟再同步一次选中态：防止站点 SPA 在 DOMContentLoaded 之后才渲染完成
  setTimeout(function () {

  }, 500);
  // 单一兜底定时器：仅补色，不破坏 CSS 已管好的 hover/active 过渡
  setInterval(function () {
    buildToggleButton();       // 防止 SPA 重建 DOM 后按钮丢失
    paintMenuBase();
    ensureHomeActive();    // 持续保证首页按钮为默认选中
    ensureHiddenItem();    // 持续隐藏 ul:nth-child(5) > li:nth-child(6)

  }, 600);

  // 【关键改动】彻底移除 init() 里的 MutationObserver(runOnce)。
  // runOnce() 会重建主题切换按钮、重绑事件、重新扫描菜单 —— 每次 DOM 变化
  // 都全量重跑，等价于「每帧重新渲染一次」，这是文字闪烁的最直接元凶。
  // 移除后兜底链由三部分承担：
  //   ① runOnce() 首跑一次（DOMContentLoaded / 立即执行）
  //   ② 600ms setInterval 单次扫描（补色 + 首页默认选中 + 隐藏项）
  //   ③ 路由事件：hashchange / pushState / replaceState / popstate → 触发一次 apply()
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
