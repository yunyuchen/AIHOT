// 锐奇 tab：一页打包进小程序的静态内容，按产品目录、公司介绍、联系方式组织，文案在 src/content/。
// 不请求任何接口，打开时不弹授权；只有点了联系方式才复制（剪切板）或拨号，值还是占位时按钮禁用。
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import chat from "../../assets/reechi/chat.png";
import chevron from "../../assets/reechi/chevron.png";
import docIcon from "../../assets/reechi/doc.png";
import info from "../../assets/reechi/info.png";
import logo from "../../assets/reechi/logo.png";
import mail from "../../assets/reechi/mail.png";
import phone from "../../assets/reechi/phone.png";
import pin from "../../assets/reechi/pin.png";
import shield from "../../assets/reechi/shield.png";
import integratedGauge from "../../assets/editorial/reechi-integrated-gauge.jpg";
import gaugeLine from "../../assets/editorial/reechi-gauge-line.jpg";
import type { DocName } from "../../content/docs";
import { FIXED_B_ACCESS_LOG, FIXED_C_STATEMENT } from "../../content/fixed-copy";
import { FEEDBACK_CONTACTS, FEEDBACK_HANDLING, FEEDBACK_INTRO, REECHI_ABOUT, REECHI_CONTACTS, REECHI_LEAD, REECHI_NAME, REECHI_PRODUCTS, type ContactLine } from "../../content/reechi-tab";
import { useActiveTab } from "../../lib/use-active-tab";
import { useTabShare } from "../../lib/use-share";
import "./index.scss";

const CONTACT_ICONS: Record<ContactLine["icon"], string> = { phone, mail, pin, chat };
const DOC_ENTRIES: { name: DocName; label: string; icon: string }[] = [
  { name: "about", label: "关于锐奇微报", icon: info },
  { name: "agreement", label: "用户协议", icon: docIcon },
  { name: "privacy", label: "隐私说明", icon: shield },
];

function isPlaceholder(value: string): boolean {
  return /\[[^\]]*\]/.test(value);
}

export default function ReechiPage() {
  useTabShare();
  useActiveTab();
  return (
    <View className="reechi">
      <View className="reechi-head">
        <Image className="reechi-head__logo" src={logo} />
        <View className="reechi-head__text">
          <Text className="reechi-head__eyebrow">{REECHI_NAME} / REECHI</Text>
          <Text className="reechi-head__name">精密测量，{"\n"}看见更细微。</Text>
          <Text className="reechi-head__lead">{REECHI_LEAD}</Text>
          <View className="reechi-head__contact" ariaRole="button" hoverClass="reechi-head__contact--down" onClick={() => void Taro.pageScrollTo({ selector: "#reechi-contacts", duration: 250 })}>联系我们</View>
        </View>
        <Image className="reechi-head__mark" src={logo} mode="aspectFit" />
      </View>
      <View className="reechi-content">
        <View className="sheet">
          <Text className="sheet__eyebrow">MEASUREMENT SYSTEMS</Text>
          <Text className="sheet__title">产品与应用</Text>
          <View className="product-visual"><Image className="product-visual__image" src={integratedGauge} mode="aspectFit" /><Text className="product-visual__caption">射线激光一体机 · 锐奇官网产品图</Text></View>
          <View className="tiles">{REECHI_PRODUCTS.map((item, i) => <View key={i} className="tile"><Text className="tile__name">{item.name}</Text><Text className="tile__text">{item.text}</Text></View>)}</View>
          <View className="product-visual product-visual--line"><Image className="product-visual__image" src={gaugeLine} mode="aspectFill" /><Text className="product-visual__caption">在线测量应用 · 锐奇官网配图</Text></View>
          <Text className="source-note">来源：锐奇官网</Text>
        </View>
        <View className="sheet"><Text className="sheet__eyebrow">ABOUT</Text><Text className="sheet__title">关于锐奇</Text>{REECHI_ABOUT.map((text, i) => <Text key={i} className="sheet__text">{text}</Text>)}</View>
        <View id="reechi-contacts" className="sheet sheet--list"><Text className="sheet__title sheet__head">联系我们</Text>{REECHI_CONTACTS.map((line, i) => <ContactRow key={line.label} line={line} rule={i > 0} />)}</View>
        <View className="sheet sheet--list">{DOC_ENTRIES.map((entry, i) => <View key={entry.name} className={`cell${i > 0 ? " cell--rule" : ""}`} hoverClass="cell--down" ariaRole="link" onClick={() => void Taro.navigateTo({ url: `/pages/doc/index?name=${entry.name}` })}><Image className="cell__ico" src={entry.icon} /><View className="cell__body"><Text className="cell__lbl">{entry.label}</Text><Image className="cell__chev" src={chevron} /></View></View>)}</View>
        <View className="sheet sheet--list"><Text className="sheet__title sheet__head">反馈与侵权投诉</Text><Text className="sheet__text sheet__pad">{FEEDBACK_INTRO}</Text>{FEEDBACK_CONTACTS.map((line, i) => <ContactRow key={line.label} line={line} rule={i > 0} />)}<Text className="sheet__text sheet__pad sheet__foot">{FEEDBACK_HANDLING}</Text></View>
        <View className="note"><Text className="note__line">{FIXED_C_STATEMENT}</Text><Text className="note__line note__log">{FIXED_B_ACCESS_LOG}</Text></View>
      </View>
    </View>
  );
}


/** 联系方式的一行：整行可点（≥ 48px），电话拨号，其余复制；值是占位时禁用。值可以长按选中。 */
function ContactRow({ line, rule }: { line: ContactLine; rule: boolean }) {
  const off = isPlaceholder(line.value);
  const verb = line.action === "call" ? "拨打" : "复制";
  const onTap = () => {
    if (off) return;
    if (line.action === "call") {
      // 读者在系统弹窗里取消也走 fail，不用提示。
      Taro.makePhoneCall({ phoneNumber: line.value.replace(/[\s-]/g, "") }).catch(() => undefined);
    } else {
      // 成功时微信自带“内容已复制”提示；读者拒绝剪切板授权或写入失败时，告诉他可以长按文字自己复制。
      Taro.setClipboardData({ data: line.value }).catch(() =>
        Taro.showModal({ title: "复制失败", content: "请长按页面文字并选择复制", showCancel: false }),
      );
    }
  };
  return (
    <View
      className={`cell contact${rule ? " cell--rule" : ""}${off ? " contact--off" : ""}`}
      hoverClass={off ? "none" : "cell--down"}
      ariaRole="button"
      ariaLabel={off ? `${line.label}，待提供` : `${verb}${line.label}`}
      onClick={onTap}
    >
      <Image className="cell__ico" src={CONTACT_ICONS[line.icon]} />
      <View className="cell__body">
        <View className="contact__text">
          <Text className="contact__label">{line.label}</Text>
          <Text className="contact__value" userSelect>
            {line.note ? `${line.value}（${line.note}）` : line.value}
          </Text>
        </View>
        <Text className="contact__verb">{verb}</Text>
      </View>
    </View>
  );
}
