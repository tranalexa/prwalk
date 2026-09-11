export const SAMPLE_DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet(name: string): string {
-  return name;
+  return \`Hello, \${name}\`;
 }
diff --git a/src/main.ts b/src/main.ts
index 3333333..4444444 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,2 +1,4 @@
+import { greet } from './greet';
 export function main() {
+  greet('world');
 }
`;

export const SAMPLE_GREET_POST = `export function greet(name: string): string {
  return \`Hello, \${name}\`;
}
`;

export const SAMPLE_MAIN_POST = `import { greet } from './greet';
export function main() {
  greet('world');
}
`;

export const CROSS_FILE_DIFF = `diff --git a/src/wrapper.ts b/src/wrapper.ts
index 1111111..2222222 100644
--- a/src/wrapper.ts
+++ b/src/wrapper.ts
@@ -1,3 +1,6 @@
 export function wrap() {
+  if (isValidationRender()) {
+    return true;
+  }
   return false;
 }
diff --git a/dev/null b/test/e2e/app-dir/demo/page.tsx
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/test/e2e/app-dir/demo/page.tsx
@@ -0,0 +1,3 @@
+export default function Page() {
+  return <div>ok</div>;
+}
`;
