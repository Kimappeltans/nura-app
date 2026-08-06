import React from 'react';
import Svg, { Path } from 'react-native-svg';

/**
 * Brand marks for the integrations list.
 *
 * Where an official mark exists under a permissive licence it is used verbatim:
 * the paths below for Google Calendar, Asana, Notion, Jira, Linear, Todoist and
 * Apple are Simple Icons (CC0), copied exactly rather than redrawn, so the
 * geometry is correct rather than approximately correct.
 *
 * Slack, Outlook and Microsoft To Do are NOT here. Simple Icons removed them
 * after trademark requests from their owners, and hand-redrawing a mark someone
 * has actively asked not to be redistributed is a bad trade for a 24px glyph.
 * Those three get a neutral glyph in the brand's own colour instead, which
 * identifies the service without reproducing anyone's logo.
 *
 * Using a company's mark to label "connect to this service" is ordinary
 * nominative use and is what every integrations directory does — but each
 * brand publishes guidelines (minimum size, clear space, no recolouring), and
 * they're worth a read before this ships.
 *
 * Drawn with react-native-svg, which is already a dependency. No icon package
 * is installed: the web icon libraries are DOM components and don't render in
 * React Native at all.
 */

type P = { size?: number; color?: string };

export const GoogleCalColor = '#4285F4';
export function GoogleCalIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" fill={color ?? GoogleCalColor} />
    </Svg>
  );
}

export const AsanaColor = '#F06A6A';
export function AsanaIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18.78 12.653c-2.882 0-5.22 2.336-5.22 5.22s2.338 5.22 5.22 5.22 5.22-2.34 5.22-5.22-2.336-5.22-5.22-5.22zm-13.56 0c-2.88 0-5.22 2.337-5.22 5.22s2.338 5.22 5.22 5.22 5.22-2.338 5.22-5.22-2.336-5.22-5.22-5.22zm12-6.525c0 2.883-2.337 5.22-5.22 5.22-2.882 0-5.22-2.337-5.22-5.22 0-2.88 2.338-5.22 5.22-5.22 2.883 0 5.22 2.34 5.22 5.22z" fill={color ?? AsanaColor} />
    </Svg>
  );
}

export const NotionColor = '#000000';
export function NotionIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" fill={color ?? NotionColor} />
    </Svg>
  );
}

export const JiraColor = '#0052CC';
export function JiraIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z" fill={color ?? JiraColor} />
    </Svg>
  );
}

export const LinearColor = '#5E6AD2';
export function LinearIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z" fill={color ?? LinearColor} />
    </Svg>
  );
}

export const TodoistColor = '#E44332';
export function TodoistIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 0H3C1.35 0 0 1.35 0 3v3.858s3.854 2.24 4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.608 8.136-4.675.279-.161.58-.107.748-.01.164.097.606.348.84.48.232.134.221.502.013.622l-9.712 5.59c-.346.2-.69.204-1.048.002C3.478 10.907.998 9.463 0 8.882v2.02l4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.609 8.136-4.676.279-.16.58-.106.748-.008.164.096.606.347.84.48.232.133.221.5.013.62-.208.121-9.288 5.346-9.712 5.59-.346.2-.69.205-1.048.002C3.478 14.951.998 13.506 0 12.926v2.02l4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.609 8.136-4.676.279-.16.58-.106.748-.009.164.097.606.348.84.48.232.133.221.502.013.622l-9.712 5.59c-.346.199-.69.204-1.048.001C3.478 18.994.998 17.55 0 16.97V21c0 1.65 1.35 3 3 3h18c1.65 0 3-1.35 3-3V3c0-1.65-1.35-3-3-3z" fill={color ?? TodoistColor} />
    </Svg>
  );
}

export const AppleColor = '#000000';
export function AppleIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" fill={color ?? AppleColor} />
    </Svg>
  );
}

/* --- neutral glyphs, brand colour only --- */

export const OutlookColor = '#0F6CBD';
export function OutlookIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? OutlookColor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <Path d="M3.4 7.5L12 13l8.6-5.5" />
    </Svg>
  );
}

export const SlackColor = '#4A154B';
export function SlackIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? SlackColor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-4.1-1L3 20.5l1.6-4.8A8.4 8.4 0 013 11.5 8.4 8.4 0 0112 3.1a8.4 8.4 0 019 8.4z" />
    </Svg>
  );
}

export const MsTodoColor = '#2564CF';
export function MsTodoIcon({ size = 21, color }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color ?? MsTodoColor} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 6.5a2 2 0 012-2h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
      <Path d="M8.4 12.2l2.6 2.6 4.8-5" />
    </Svg>
  );
}
