using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace BastionBarons.EditorTools
{
    /// <summary>
    /// Builds Android (APK de teste e AAB para a Google Play), via menu ou linha de comando:
    ///   Unity -batchmode -quit -projectPath . -executeMethod BastionBarons.EditorTools.BuildScript.BuildApkCli
    ///   Unity -batchmode -quit -projectPath . -executeMethod BastionBarons.EditorTools.BuildScript.BuildAabCli
    /// Assinatura: variáveis de ambiente BB_KEYSTORE_PATH, BB_KEYSTORE_PASS, BB_KEY_ALIAS, BB_KEY_PASS.
    /// Versão: BB_VERSION_NAME (ex. 0.1.0) e BB_VERSION_CODE (inteiro crescente).
    /// </summary>
    public static class BuildScript
    {
        [MenuItem("Bastion Barons/Build/Android APK (teste)")]
        public static void BuildApk() { Build(false); }

        [MenuItem("Bastion Barons/Build/Android AAB (Google Play)")]
        public static void BuildAab() { Build(true); }

        public static void BuildApkCli() { Build(false); }
        public static void BuildAabCli() { Build(true); }

        static void Build(bool appBundle)
        {
            ProjectSetup.Run();
            EditorUserBuildSettings.buildAppBundle = appBundle;

            string versionName = Environment.GetEnvironmentVariable("BB_VERSION_NAME");
            string versionCode = Environment.GetEnvironmentVariable("BB_VERSION_CODE");
            if (!string.IsNullOrEmpty(versionName)) PlayerSettings.bundleVersion = versionName;
            int code;
            if (int.TryParse(versionCode, out code)) PlayerSettings.Android.bundleVersionCode = code;

            string ks = Environment.GetEnvironmentVariable("BB_KEYSTORE_PATH");
            if (!string.IsNullOrEmpty(ks) && File.Exists(ks))
            {
                PlayerSettings.Android.useCustomKeystore = true;
                PlayerSettings.Android.keystoreName = ks;
                PlayerSettings.Android.keystorePass = Environment.GetEnvironmentVariable("BB_KEYSTORE_PASS");
                PlayerSettings.Android.keyaliasName = Environment.GetEnvironmentVariable("BB_KEY_ALIAS");
                PlayerSettings.Android.keyaliasPass = Environment.GetEnvironmentVariable("BB_KEY_PASS");
            }
            else if (appBundle)
            {
                Debug.LogWarning("[Build] AAB sem keystore de upload: a Google Play não aceitará este arquivo. Configure BB_KEYSTORE_*.");
            }

            Directory.CreateDirectory("Builds/Android");
            var options = new BuildPlayerOptions
            {
                scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray(),
                locationPathName = appBundle ? "Builds/Android/BastionBarons.aab" : "Builds/Android/BastionBarons.apk",
                target = BuildTarget.Android,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log("[Build] " + report.summary.result + " -> " + options.locationPathName + " (" + report.summary.totalSize / (1024 * 1024) + " MB)");
            if (report.summary.result != BuildResult.Succeeded && Application.isBatchMode) EditorApplication.Exit(1);
        }
    }
}
