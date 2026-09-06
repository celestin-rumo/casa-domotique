import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";

export const isNative = Capacitor.isNativePlatform();

export async function setupNative() {
  if (!isNative) return;
  await StatusBar.setStyle({ style: Style.Dark });
}

export async function tap() {
  if (!isNative) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}
