// 锐奇 tab：一页打包进小程序的静态内容，文案在 src/content/，不请求任何接口，打开时不弹授权。
// 页首一张钴蓝单色的通栏版图（一体机），下面 logo、“锐奇”和一句话介绍；内容栏目“产品与应用”“关于锐奇”“联系我们”用钴蓝栏头，
// 功能栏目“文档”“反馈与侵权投诉”“声明”用纸底墨字的栏头。产线图放在四个产品后面，不插在产品之间（免得读者以为图里就是相邻那台设备）。
// 只有点了联系方式才复制（剪切板）或拨号，值还是占位时按钮禁用。
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import chevron from "../../assets/reechi/chevron.png";
import logo from "../../assets/reechi/logo.png";
import plateGauge from "../../assets/reechi/plate-gauge.jpg";
import figLine from "../../assets/reechi/fig-line.jpg";
import { HeadTab } from "../../components/head-tab";
import { Figure } from "../../components/figure";
import type { DocName } from "../../content/docs";
import { FIXED_B_ACCESS_LOG, FIXED_C_STATEMENT } from "../../content/fixed-copy";
import { FEEDBACK_CONTACTS, FEEDBACK_HANDLING, FEEDBACK_INTRO, REECHI_ABOUT, REECHI_CONTACTS, REECHI_LEAD, REECHI_NAME, REECHI_PRODUCTS, type ContactLine } from "../../content/reechi-tab";
import { useActiveTab } from "../../lib/use-active-tab";
import { useTabShare } from "../../lib/use-share";
import "./index.scss";

const DOC_ENTRIES: { name: DocName; label: string }[] = [
  { name: "about", label: "关于锐奇微报" },
  { name: "agreement", label: "用户协议" },
  { name: "privacy", label: "隐私说明" },
];

function isPlaceholder(value: string): boolean {
  return /\[[^\]]*\]/.test(value);
}

/** 产品说明“锂电涂布：全幅宽……”拆成用途和说明两行；没有“：”时整段是说明。只拆显示，不改文案。 */
function splitUse(text: string): { use: string; text: string } {
  const i = text.indexOf("：");
  return i > 0 ? { use: text.slice(0, i), text: text.slice(i + 1) } : { use: "", text };
}

export default function ReechiPage() {
  useTabShare();
  useActiveTab();
  return (
    <View className="reechi">
      <Figure kind="plate" src={plateGauge} name="射线激光一体机" source="锐奇官网产品图" />
      <View className="org">
        <View className="org__top">
          <Image className="org__logo" src={logo} />
          <Text className="org__name">{REECHI_NAME}</Text>
        </View>
        <Text className="org__lead">{REECHI_LEAD}</Text>
        <View className="org__contact" ariaRole="button" hoverClass="org__contact--down" onClick={() => void Taro.pageScrollTo({ selector: "#reechi-contacts", duration: 250 })}>
          联系我们
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="产品与应用" />
        <View className="reechi-block__body">
          {REECHI_PRODUCTS.map((item, i) => {
            const product = splitUse(item.text);
            return (
              <View key={i} className="product">
                <Text className="product__name">{item.name}</Text>
                {product.use && <Text className="product__use">{product.use}</Text>}
                <Text className="product__text">{product.text}</Text>
              </View>
            );
          })}
          <View className="reechi-figure">
            <Figure kind="line" src={figLine} name="在线测量应用" source="锐奇官网配图" />
          </View>
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="关于锐奇" />
        <View className="reechi-block__body">
          {REECHI_ABOUT.map((text, i) => (
            <Text key={i} className="reechi-para">{text}</Text>
          ))}
        </View>
      </View>

      <View id="reechi-contacts" className="reechi-block">
        <HeadTab label="联系我们" />
        <View className="reechi-rows">
          {REECHI_CONTACTS.map((line) => <ContactRow key={line.label} line={line} />)}
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="文档" plain />
        <View className="reechi-rows">
          {DOC_ENTRIES.map((entry) => (
            <View key={entry.name} className="reechi-doc" hoverClass="reechi-doc--down" ariaRole="link" onClick={() => void Taro.navigateTo({ url: `/pages/doc/index?name=${entry.name}` })}>
              <Text className="reechi-doc__label">{entry.label}</Text>
              <Image className="reechi-doc__chev" src={chevron} />
            </View>
          ))}
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="反馈与侵权投诉" plain />
        <View className="reechi-block__body">
          <Text className="reechi-para">{FEEDBACK_INTRO}</Text>
        </View>
        <View className="reechi-rows">
          {FEEDBACK_CONTACTS.map((line) => <ContactRow key={line.label} line={line} />)}
        </View>
        <View className="reechi-block__body">
          <Text className="reechi-para">{FEEDBACK_HANDLING}</Text>
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="声明" plain />
        <View className="reechi-block__body">
          <Text className="reechi-legal">{FIXED_C_STATEMENT}</Text>
          <Text className="reechi-legal">{FIXED_B_ACCESS_LOG}</Text>
        </View>
      </View>
    </View>
  );
}

/** 联系方式的一行：整行可点（≥ 64），电话拨号，其余复制；值是占位时禁用。值可以长按选中。 */
function ContactRow({ line }: { line: ContactLine }) {
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
      className={off ? "contact contact--off" : "contact"}
      hoverClass={off ? "none" : "contact--down"}
      ariaRole="button"
      ariaLabel={off ? `${line.label}，待提供` : `${verb}${line.label}`}
      onClick={onTap}
    >
      <View className="contact__main">
        <Text className="contact__label">{line.label}</Text>
        <Text className="contact__value" userSelect>
          {line.value}
        </Text>
        {line.note && <Text className="contact__note">{line.note}</Text>}
      </View>
      <View className="contact__verb">{verb}</View>
    </View>
  );
}
