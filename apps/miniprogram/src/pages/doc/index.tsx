// 文档页：关于锐奇微报、用户协议、隐私说明。下钻页，参数 name 选哪篇（about、agreement、privacy）。
// 规格的页面表和票都定了“一个文档页带 name 参数”，所以三篇共用这一个页面；内容是打包进来的常量（src/content/docs.ts），不请求接口。
import { Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect } from "react";
import { PageState } from "../../components/page-state";
import { findDoc, type DocBlock, type DocListItem } from "../../content/docs";
import "./index.scss";

export default function DocPage() {
  const { params } = useRouter();
  const doc = findDoc(params.name);
  useEffect(() => {
    if (doc) void Taro.setNavigationBarTitle({ title: doc.title });
  }, [doc]);

  if (!doc) return <PageState title="没有这篇文档" detail="返回“锐奇”页重新打开" />;
  return (
    <View className="doc">
      <Text className="doc__title">{doc.title}</Text>
      <Text className="doc__version">{doc.draft ? `${doc.version} · 草稿，待客户确认` : doc.version}</Text>
      {doc.facts && (
        <View className="doc__facts">
          {doc.facts.map(([key, value]) => (
            <View key={key} className="doc__fact">
              <Text className="doc__fact-key">{key}</Text>
              <Text className="doc__fact-value" userSelect>
                {value}
              </Text>
            </View>
          ))}
        </View>
      )}
      {doc.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </View>
  );
}

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "h":
      return <Text className="doc__h">{block.text}</Text>;
    case "p":
      return (
        <Text className="doc__p" userSelect>
          {block.text}
        </Text>
      );
    case "quote":
      return (
        <View className="doc__quote">
          <Text userSelect>{block.text}</Text>
        </View>
      );
    case "ul":
    case "ol":
      return (
        <View className="doc__list">
          {block.items.map((item, i) => (
            <View key={i} className="doc__item">
              <Text className="doc__marker num">{block.kind === "ol" ? `${i + 1}.` : "•"}</Text>
              <ListText item={item} />
            </View>
          ))}
        </View>
      );
  }
}

function ListText({ item }: { item: DocListItem }) {
  if (typeof item === "string") {
    return (
      <Text className="doc__item-text" userSelect>
        {item}
      </Text>
    );
  }
  return (
    <Text className="doc__item-text" userSelect>
      <Text className="doc__term">{item.term}</Text>
      {item.text}
    </Text>
  );
}
