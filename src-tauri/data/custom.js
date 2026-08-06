window.addEventListener("DOMContentLoaded",()=>{const t=document.createElement("script");t.src="https://www.googletagmanager.com/gtag/js?id=G-W5GKHM0893",t.async=!0,document.head.appendChild(t);const n=document.createElement("script");n.textContent="window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-W5GKHM0893');",document.body.appendChild(n)});function waitDomReady(cb) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cb);
    } else cb();
}

waitDomReady(()=>{
    const BAR_HEIGHT = 28;
    const APP_LINK = "https://dl.hhkan0.com/";
    let css = null;
    let topBar = null;
    let observer = null;

    function buildUI() {
        if(document.querySelector("#pake-window-top-bar")) return;

        css = document.createElement("style");
        css.textContent = `
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
    background:#2962d8;
}

/*弹窗样式*/
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
.btn-copy{background:#2b7bdd;color:#fff;}

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
    background:#2962d8;
    color:#fff;
    border:none;
    border-radius:5px;
    font-size:14px;
    cursor:pointer;
}
#pake-btn-confirm:hover{
    background:#3b74ec;
}
        `;
        document.head.appendChild(css);

        topBar = document.createElement('div');
        topBar.id = "pake-window-top-bar";
        topBar.innerHTML = `
            <button id="btn-back">⬅ 回退</button>
            <button id="btn-forward">➡ 前进</button>
            <button id="btn-refresh">🔄 刷新</button>
            <button id="btn-app">📱APP</button>
            <button id="btn-topmost">📌 置顶窗口</button>
        `;
        document.body.appendChild(topBar);

        document.querySelector('#btn-back').addEventListener('click',()=>history.back());
        document.querySelector('#btn-forward').addEventListener('click',()=>history.forward());
        document.querySelector('#btn-refresh').addEventListener('click',()=>location.reload());

        //APP按钮：弹出弹窗
        document.querySelector('#btn-app').addEventListener('click',()=>{
            if(document.querySelector('#app-modal-mask')) return;

            const mask = document.createElement('div');
            mask.id = 'app-modal-mask';
            //按钮文字修改为：点击复制
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

            //我知道了：关闭弹窗
            mask.querySelector('.btn-know').onclick = ()=>{
                mask.remove();
            };

            //点击复制：复制链接到剪贴板
            mask.querySelector('.btn-copy').onclick = async ()=>{
                try{
                    await navigator.clipboard.writeText(APP_LINK);
                    alert("链接已复制到剪贴板");
                }catch(err){
                    alert("复制失败，请手动复制");
                }
            };

            //点击遮罩层关闭弹窗
            mask.onclick = (e)=>{
                if(e.target === mask) mask.remove();
            };
        });

        let isTopMost = false;
        const btnTop = document.querySelector('#btn-topmost');
        btnTop.addEventListener('click',async ()=>{
            if(!window.__TAURI__){
                alert("仅打包后的Pake软件可使用置顶功能，预览模式无效");
                return;
            }
            try{
                const win = window.__TAURI__.window.getCurrentWindow();
                isTopMost = !isTopMost;
                await win.setAlwaysOnTop(isTopMost);
                if(isTopMost){
                    btnTop.textContent = "📌 取消置顶";
                    btnTop.classList.add("top-active");
                }else{
                    btnTop.textContent = "📌 置顶窗口";
                    btnTop.classList.remove("top-active");
                }
            }catch(e){
                console.error(e);
                alert("设置置顶失败："+e.message);
            }
        });
    }

    function fixAllFixedElements(){
        document.querySelectorAll('*').forEach(el=>{
            const pos = getComputedStyle(el).position;
            if(pos === 'fixed' || pos === 'sticky'){
                if(el.id === 'pake-window-top-bar') return;
                const isVideoEl = el.tagName === 'VIDEO' || el.querySelector('video');
                const isFullScreen = !!document.fullscreenElement;
                if(isVideoEl || isFullScreen) return;
                el.style.setProperty('top', BAR_HEIGHT+'px', 'important');
            }
        })
    }

    function startWatch(){
        if(observer) observer.disconnect();
        observer = new MutationObserver((mutations)=>{
            if(!document.querySelector("#pake-window-top-bar")){
                buildUI();
            }
            fixAllFixedElements();
        });
        observer.observe(document.documentElement, {
            childList:true,
            subtree:true,
            attributes:true
        });
        fixAllFixedElements();
    }

    buildUI();
    startWatch();

    document.addEventListener("fullscreenchange",()=>{
        fixAllFixedElements();
    })

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
            document.querySelector('#pake-btn-confirm').addEventListener('click',()=>{
                sessionStorage.setItem("pake_session_ok","yes");
                maskDom.remove();
            });
        }
    }
})

setTimeout(()=>{
    if(!document.querySelector("#pake-window-top-bar")){
        const evt = new Event('DOMContentLoaded');
        document.dispatchEvent(evt);
    }
},1500);
