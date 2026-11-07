// 展示外壳：Shell.mount({ title, sub, screens })。每个 screen：
//   name      手机上方的说明
//   nav       { title, bg, fg: "#000"|"#fff", back?: true }，微信原生导航栏只能设底色和黑/白字
//   body      页面内容的 HTML 字符串（从导航栏下面开始）
//   fixed     贴底元素的 HTML（tabBar 或条目页操作条），自己留 34px 安全区；没有就不传
//   page      页面底色（也用作回弹背景）
// ?full=1 时手机展开成整页长度。
(function () {
  const full = new URLSearchParams(location.search).has("full");
  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  function phone(s) {
    const nav = s.nav || {};
    const dark = (nav.fg || "#000") === "#fff";
    const vars = [
      `--page:${s.page || "#fff"}`,
      `--nav-bg:${nav.bg || s.page || "#fff"}`,
      `--nav-fg:${nav.fg || "#000"}`,
      `--cap-bg:${dark ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.72)"}`,
      `--cap-line:${dark ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.12)"}`,
      `--cap-fg:${dark ? "#fff" : "#000"}`,
      `--home:${s.home || "#111"}`,
    ].join(";");
    return `
      <figure class="shell__screen">
        <figcaption class="shell__cap">${esc(s.name)}</figcaption>
        <div class="phone" style="${vars}">
          <div class="phone__status"><span>06:40</span><span class="phone__status-icons"><i style="width:17px;height:11px;clip-path:polygon(0 100%,25% 100%,25% 70%,50% 70%,50% 40%,75% 40%,75% 10%,100% 10%,100% 100%,0 100%)"></i><i style="width:25px;height:12px;border-radius:3px"></i></span></div>
          <div class="phone__notch"></div>
          <div class="phone__nav">${nav.back ? '<span class="phone__back"></span>' : ""}${esc(nav.title)}<span class="phone__capsule"><span class="phone__dots"></span><span class="phone__ring"></span></span></div>
          <div class="phone__body"${s.fixed ? ` style="padding-bottom:${s.clearance ?? 96}px"` : ""}>${s.body}</div>
          ${s.fixed ? `<div class="phone__fixed">${s.fixed}</div>` : ""}
          <div class="phone__home"></div>
        </div>
      </figure>`;
  }
  window.esc = esc;
  window.Shell = {
    mount({ title, sub, screens }) {
      document.body.className = "shell" + (full ? " full" : "");
      document.body.innerHTML = `
        <header class="shell__head"><h1 class="shell__title">${esc(title)}</h1>${sub ? `<p class="shell__sub">${esc(sub)}</p>` : ""}</header>
        <div class="shell__row">${screens.map(phone).join("")}</div>`;
    },
  };
})();
