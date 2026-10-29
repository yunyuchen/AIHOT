import { Component } from "react";
import Taro from "@tarojs/taro";
import { Image, Text, View } from "@tarojs/components";
import { appTabs } from "../lib/tabs";
import { buildConfig } from "../lib/build-config";
import "./index.scss";

const tabs = appTabs(buildConfig.boards);

// 微信给每个 tab 页保留独立实例；页面 onShow 同步选中项，冷启动则从当前页面栈读取。
export default class TabBar extends Component {
  state = { selected: "" };

  componentDidMount() {
    const pages = Taro.getCurrentPages();
    this.setState({ selected: pages[pages.length - 1]?.route ?? tabs[0].pagePath });
  }

  render() {
    return (
      <View className="floating-tabs">
        {tabs.map((tab) => {
          const active = this.state.selected === tab.pagePath;
          return (
            <View key={tab.key} className={"floating-tabs__item" + (active ? " floating-tabs__item--active" : "")}
              ariaRole="button" ariaLabel={tab.text + (active ? "，当前页面" : "")}
              hoverClass="floating-tabs__item--down"
              onClick={() => {
                if (!active) void Taro.switchTab({ url: "/" + tab.pagePath }).catch(() => Taro.showToast({ title: "切换失败，请重试", icon: "none" }));
              }}>
              <Image className="floating-tabs__icon" src={"/assets/tab/" + tab.key + (active ? "-on" : "") + ".png"} />
              <Text className="floating-tabs__label">{tab.text}</Text>
            </View>
          );
        })}
      </View>
    );
  }
}
