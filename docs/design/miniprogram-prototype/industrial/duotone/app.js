// 双色套印 · 技术期刊：四屏静态原型。数据全部来自 ../data.js（window.DATA），这里只做排版。
(function () {
  const D = window.DATA;
  const PAPER = "#e9e9e3";
  const NAV = { bg: PAPER, fg: "#000" };

  // ---------- 小件 ----------
  const num = (v) => `<span class="num">${esc(v)}</span>`;
  const ai = () => `<span class="ai">AI 摘要</span>`;
  const sw = (key) => `<i class="sw" style="background:${D.categoryColors[key] || D.categoryColors.industry}"></i>`;
  const cat = (key, label) => `<span class="cat">${sw(key)}${esc(label)}</span>`;
  const head = (label, aside = "") =>
    `<div class="head"><span class="head__tab">${esc(label)}</span>${aside ? `<span class="head__aside">${aside}</span>` : ""}</div>`;
  // 功能性栏头（文档、反馈与侵权投诉、声明）：纸底墨字，不加色块
  const headPlain = (label) => `<div class="head head--plain">${esc(label)}</div>`;
  // 日期 "11-06" → "11月6日"
  const md = (s) => { const [m, d] = s.split("-").map(Number); return `${m}月${d}日`; };
  // “现在”往前推 n 天的北京日期，“11月6日 周五”。分组日期一律这样推，不读日报。
  const WEEK = "日一二三四五六";
  const daysAgo = (n) => {
    const t = new Date(Date.parse(D.now) + 8 * 3600e3 - n * 86400e3);
    return `${t.getUTCMonth() + 1}月${t.getUTCDate()}日 周${WEEK[t.getUTCDay()]}`;
  };
  // 卡上时刻：分组栏头已经写了“昨天”，卡上只留 HH:MM
  const clock = (t) => t.replace(/^昨天\s*/, "");

  const svg = (cls, inner, vb = "0 0 24 24") => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;
  const CHEV_R = '<path d="M9 5l7 7-7 7"/>';
  const CHEV_L = '<path d="M15 5l-7 7 7 7"/>';
  const BOOKMARK = '<path d="M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z"/>';

  // tabBar 线框图标：ic-s 是外形（选中时填墨），ic-i 是内部的线、ic-f 是内部的实心块（选中时都变纸色）
  const ICON = {
    // 精选：版面缩略，一块方形配图、旁边两行短字、下面一行通栏字
    精选: '<path class="ic-s" d="M3.5 4.5h17v15h-17z"/><path class="ic-f" d="M6.5 7.5h5v5h-5z"/><path class="ic-i" d="M14 8.25h3.5M14 11.75h3.5M6.5 16h11"/>',
    日报: '<path class="ic-s" d="M5.5 3.5h9l4 4v13h-13z"/><path class="ic-i" d="M14.5 3.5v4h4M8.5 12h7M8.5 15.5h7"/>',
    运动健康: '<path class="ic-s" d="M12 20.2l-7.3-7.1a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5z"/>',
    收藏: '<path class="ic-s" d="M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z"/>',
    锐奇: '<circle class="ic-s" cx="12" cy="12.5" r="8.3"/><path class="ic-i" d="M12 12.5l4-4M12 6.4v1.8M6 12.5h1.8M16.2 12.5H18"/>',
  };
  const tabbar = (active) =>
    `<nav class="dt tabbar">${D.tabs.map((t) =>
      `<div class="tab${t === active ? " tab--on" : ""}">${svg("tab__ico", ICON[t])}<span class="tab__txt">${esc(t)}</span></div>`).join("")}</nav>`;

  // ================= 1 精选 =================
  function feed() {
    const f = D.focus;
    const mast = `
      <section class="mast">
        <div class="mast__band">
          <span class="mast__title">${esc(D.appName)}</span>
        </div>
        <div class="mast__main">
          <div class="mast__date">
            <span class="mast__dayline"><img class="mast__logo" src="../assets/logo.png" alt="锐奇"><span class="mast__day">${esc(D.nowText)}</span></span>
            <span class="mast__week">第${num(D.isoWeek)}周</span>
          </div>
          <div>
            <div class="mast__kicker">今日焦点</div>
            <div class="meta mast__meta">${cat(f.category, f.categoryLabel)}${f.ai ? ai() : ""}</div>
            <div class="mast__headline">${esc(f.title)}</div>
          </div>
        </div>
      </section>
      <section class="focus">
        <div class="focus__sum">${esc(f.summary)}</div>
        <div class="focus__src">${f.sourceNames.map(esc).join("、")}</div>
        <div class="focus__bar">
          <span class="stat">来源${num(f.sourceCount)}家</span>
          <span class="stat">最新${num(f.latest)}</span>
          <span class="btn btn--ink">读摘要</span>
        </div>
      </section>`;

    const filters = `
      <div class="filters">
        <span class="chip chip--on">全部</span>
        ${D.categories.map((c) => `<span class="chip">${sw(c.key)}${esc(c.label)}</span>`).join("")}
      </div>`;

    // 按时段分组，保持接口顺序
    const groups = [];
    for (const c of D.cards) {
      let g = groups[groups.length - 1];
      if (!g || g.period !== c.period) groups.push((g = { period: c.period, cards: [] }));
      g.cards.push(c);
    }
    // 今天的分组只写时段（日期在刊头里），从“昨天”起才带日期
    const back = { 昨天: 1, 前天: 2 };
    const dateOf = (period) => (back[period] ? daysAgo(back[period]) : "");
    const entry = (c) => `
      <article class="entry">
        <div class="entry__time cond">${esc(clock(c.time))}</div>
        <div class="entry__main">
          <div class="meta">${cat(c.category, c.categoryLabel)}${c.ai ? ai() : ""}</div>
          <div class="entry__title">${esc(c.title)}</div>
          <div class="entry__sum">${esc(c.summary)}</div>
          <div class="entry__foot">
            <span class="entry__src">${esc(c.source)}</span>
            ${c.sourceCount >= 2 ? `<span class="many">${num(c.sourceCount)}家在报</span>` : ""}
          </div>
        </div>
      </article>`;
    const list = groups.map((g) => `
      <section class="period">
        ${head(g.period, esc(dateOf(g.period)))}
        ${g.cards.map(entry).join("")}
      </section>`).join("");

    return `<div class="dt">${mast}${filters}${list}</div>`;
  }

  // ================= 2 日报 =================
  function daily() {
    const d = D.daily;
    const itemCount = d.sections.reduce((n, s) => n + s.items.length, 0);
    const body = `
      <div class="pager">
        <span class="pager__btn">${svg("pager__ico", CHEV_L)}前一天</span>
        <span class="pager__date">${esc(d.dateText)}</span>
        <span class="pager__btn${d.hasNext ? "" : " pager__btn--off"}">后一天${svg("pager__ico", CHEV_R)}</span>
      </div>
      <header class="issue">
        <div class="issue__day cond">${esc(d.day)}</div>
        <div class="issue__id">
          <div class="issue__name">${esc(d.title)}</div>
          <div class="issue__window">${esc(d.windowText)}</div>
        </div>
      </header>
      <div class="readings">
        <span class="stat">${num(d.sections.length)}个分节</span>
        <span class="stat">${num(itemCount)}条</span>
        <span class="stat">${num(d.publishedAt)}出刊</span>
      </div>
      <section class="lead">
        ${head("今日头条", ai())}
        <div class="lead__body">
          <div class="lead__title">${esc(d.lead.title)}</div>
          <div class="lead__para">${esc(d.lead.paragraph)}</div>
          <div class="actions">
            <span class="btn btn--line">${svg("btn__ico", BOOKMARK)}收藏</span>
            <span class="btn btn--ink">分享日报</span>
          </div>
        </div>
      </section>
      ${d.sections.map((s) => `
        <section class="sect">
          ${head(s.label, `${num(s.items.length)}条`)}
          <div class="sect__items">
            ${s.items.map((it) => `
              <div class="ditem">
                <div class="ditem__title">${esc(it.title)}</div>
                <div class="ditem__src">${esc(it.source)}</div>
              </div>`).join("")}
          </div>
        </section>`).join("")}
      <div class="note">${ai()}<span>${esc(D.copy.dailyNote)}</span></div>`;
    return `<div class="dt">${body}</div>`;
  }

  // ================= 3 条目详情 =================
  function item() {
    const it = D.item;
    const st = it.story;
    const body = `
      <article class="art">
        <div class="meta">${cat(it.category, it.categoryLabel)}${ai()}</div>
        <div class="art__title">${esc(it.title)}</div>
        <div class="art__by"><span>${esc(it.source)}</span><span>${esc(md(it.published))}</span></div>
        <div class="art__sum">${esc(it.summary)}</div>
      </article>
      <section class="block">
        ${head("为什么值得看", ai())}
        <div class="block__body">
          <div class="block__text">${esc(it.reason)}</div>
        </div>
      </section>
      <section class="block">
        ${head("来源")}
        <div class="block__body">
          <div class="srcrow">
            <div>
              <div class="srcrow__name">${esc(it.source)}</div>
              <div class="srcrow__date">${esc(md(it.published))}发布</div>
            </div>
            <span class="btn btn--line btn--sm">复制来源链接</span>
          </div>
          <div class="fine">${esc(D.copy.summaryOnly)}</div>
        </div>
      </section>
      <section class="block">
        ${head("同一事件")}
        <div class="block__body">
          <div class="story">
            <div class="story__main">
              <div class="story__title">${esc(st.title)}</div>
              <div class="story__count">${num(st.sourceCount)}家来源</div>
              <div class="story__others"><span class="story__label">其他来源</span>${st.otherSourceNames.map(esc).join("、")}</div>
            </div>
            ${svg("chev", CHEV_R)}
          </div>
        </div>
      </section>`;
    const bar = `
      <div class="dt actionbar">
        <span class="btn btn--line">${svg("btn__ico", BOOKMARK)}收藏</span>
        <span class="btn btn--ink">分享给同事</span>
      </div>`;
    return { body: `<div class="dt">${body}</div>`, bar };
  }

  // ================= 4 锐奇 =================
  function reechi() {
    const r = D.reechi;
    const placeholder = (v) => /^\[.*\]$/.test(v || "");
    // cls：fig 是页边内的配图，plate 是页首通栏版图（没有页边，图注仍从 x=20 起）
    const fig = (img, file, cls = "fig") => {
      const [name, src] = img.caption.split(/\s*·\s*/);
      return `
        <figure class="${cls}">
          <img class="fig__img" src="${file}" alt="${esc(name)}">
          <figcaption class="fig__cap"><span class="fig__name">${esc(name)}</span><span class="fig__src">图：${esc(src)}</span></figcaption>
        </figure>`;
    };
    const prod = (p) => {
      const i = p.text.indexOf("：");
      const use = i > 0 ? p.text.slice(0, i) : "";
      const text = i > 0 ? p.text.slice(i + 1) : p.text;
      return `
        <div class="prod">
          <div class="prod__name">${esc(p.name)}</div>
          ${use ? `<div class="prod__use">${esc(use)}</div>` : ""}
          <div class="prod__text">${esc(text)}</div>
        </div>`;
    };
    const contact = (c) => {
      const off = placeholder(c.value);
      const verb = c.action === "call" ? "拨打" : "复制";
      return `
        <div class="contact">
          <div class="contact__main">
            <div class="contact__label">${esc(c.label)}</div>
            <div class="contact__value${off ? " contact__value--off" : ""}">${esc(c.value)}</div>
            ${c.note ? `<div class="contact__note">${esc(c.note)}</div>` : ""}
          </div>
          <span class="btn btn--line btn--sm${off ? " btn--off" : ""}">${verb}</span>
        </div>`;
    };
    const body = `
      ${fig(r.images[0], "fig-gauge.jpg", "fig plate")}
      <section class="org">
        <div class="org__top">
          <img class="org__logo" src="../assets/logo-large.png" alt="锐奇">
          <div class="org__name">${esc(r.name)}</div>
        </div>
        <div class="org__lead">${esc(r.lead)}</div>
        <span class="btn btn--ink">联系我们</span>
      </section>
      <section class="block">
        ${head("产品与应用")}
        <div class="block__body">
          ${r.products.map(prod).join("")}
          ${fig(r.images[1], "fig-line.jpg", "fig fig--after")}
        </div>
      </section>
      <section class="block">
        ${head("关于锐奇")}
        <div class="block__body">${r.about.map((p) => `<div class="para">${esc(p)}</div>`).join("")}</div>
      </section>
      <section class="block">
        ${head("联系我们")}
        <div class="block__body">${r.contacts.map(contact).join("")}</div>
      </section>
      <section class="block">
        ${headPlain("文档")}
        <div class="block__body">
          ${["关于锐奇微报", "用户协议", "隐私说明"].map((t) => `<div class="doc"><span>${t}</span>${svg("chev", CHEV_R)}</div>`).join("")}
        </div>
      </section>
      <section class="block">
        ${headPlain("反馈与侵权投诉")}
        <div class="block__body">
          <div class="para">${esc(r.feedbackIntro)}</div>
          ${r.feedback.map(contact).join("")}
        </div>
      </section>
      <section class="block">
        ${headPlain("声明")}
        <div class="block__body">
          <div class="legal">${esc(r.statement)}</div>
          <div class="legal">${esc(r.accessLog)}</div>
        </div>
      </section>`;
    return `<div class="dt">${body}</div>`;
  }

  const it = item();
  Shell.mount({
    title: "锐奇微报原型：双色套印技术期刊",
    sub: "新闻纸上只印两色：墨印正文，钴蓝印刊头、栏头、数字和图。记忆点只有一个：精选页左上角的钴蓝竖排刊头。",
    screens: [
      { name: "精选", page: PAPER, nav: { ...NAV, title: "精选" }, body: feed(), fixed: tabbar("精选"), clearance: 110 },
      { name: "日报", page: PAPER, nav: { ...NAV, title: "锐奇微报" }, body: daily(), fixed: tabbar("日报"), clearance: 110 },
      { name: "条目详情", page: PAPER, nav: { ...NAV, title: "条目详情", back: true }, body: it.body, fixed: it.bar, clearance: 120 },
      { name: "锐奇", page: PAPER, nav: { ...NAV, title: "锐奇" }, body: reechi(), fixed: tabbar("锐奇"), clearance: 110 },
    ],
  });
})();
