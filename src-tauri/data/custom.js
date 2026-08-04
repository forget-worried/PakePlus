window.addEventListener("DOMContentLoaded",()=>{const t=document.createElement("script");t.src="https://www.googletagmanager.com/gtag/js?id=G-W5GKHM0893",t.async=!0,document.head.appendChild(t);const n=document.createElement("script");n.textContent="window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-W5GKHM0893');",document.body.appendChild(n)});function waitDomReady(cb) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cb);
    } else cb();
}

waitDomReady(()=>{
    if(document.querySelector("#pake-top-nav")) return;

    const css = document.createElement("style");
    css.textContent = `
#pake-top-nav{
    position:fixed;
    /* ✅关键改动：向下偏移，避开页面顶部内容，不再贴窗口最顶端 */
    top:8px;
    left:8px;
    /* 不再占满整行宽度，只包裹按钮，不要铺满整个页面宽度 */
    width:auto;
    z-index:999999;
    display:flex;
    align-items:center;
    gap:10px;
    box-sizing:border-box;
    pointer-events:none;
}
#pake-top-nav button{
    background:#333;
    color:#fff;
    border:none;
    padding:6px 12px;
    font-size:14px;
    border-radius:4px;
    cursor:pointer;
    pointer-events:auto;
}
#pake-top-nav button:hover{
    background:#555;
}
`;
document.head.appendChild(css);

    const topBar = document.createElement('div');
    topBar.id = "pake-top-nav";
    topBar.innerHTML = `
        <button id="btn-back">回退</button>
        <button id="btn-forward">前进</button>
    `;
    document.body.prepend(topBar);

    document.querySelector('#btn-back').addEventListener('click',()=>{
        history.back();
    });
    document.querySelector('#btn-forward').addEventListener('click',()=>{
        history.forward();
    });
})