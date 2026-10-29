import Taro, { useDidShow } from "@tarojs/taro";

export function useActiveTab() {
  useDidShow(() => {
    const { page } = Taro.getCurrentInstance();
    if (!page) return;
    Taro.nextTick(() => {
      const tab = Taro.getTabBar<{ setState: (state: { selected: string }) => void }>(page);
      const pages = Taro.getCurrentPages();
      tab?.setState({ selected: pages[pages.length - 1]?.route ?? "" });
    });
  });
}
