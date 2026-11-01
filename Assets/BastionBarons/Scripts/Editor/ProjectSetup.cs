using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace BastionBarons.EditorTools
{
    /// <summary>
    /// Configura o projeto automaticamente na primeira abertura: cena principal, materiais base
    /// (incluídos no build via Resources), ícone, identificador Android e orientação paisagem.
    /// Também disponível em: menu Bastion Barons > Configurar Projeto.
    /// </summary>
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        public const string ScenePath = "Assets/Scenes/Main.unity";
        public const string PackageId = "com.bastionbarons.game";
        const string MaterialsDir = "Assets/BastionBarons/Resources/Materials";

        static ProjectSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (Application.isBatchMode || SessionState.GetBool("BB_SetupDone", false)) return;
                SessionState.SetBool("BB_SetupDone", true);
                Run();
            };
        }

        [MenuItem("Bastion Barons/Configurar Projeto")]
        public static void Run()
        {
            EnsureMaterials();
            ConfigurePlayer();
            EnsureScene();
            AssetDatabase.SaveAssets();
            Debug.Log("[Bastion Barons] Projeto configurado.");
        }

        static void EnsureScene()
        {
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            var scenes = EditorBuildSettings.scenes.ToList();
            if (!scenes.Any(s => s.path == ScenePath))
            {
                scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
                EditorBuildSettings.scenes = scenes.ToArray();
            }
        }

        static void EnsureMaterials()
        {
            Directory.CreateDirectory(MaterialsDir);
            bool srp = GraphicsSettings.currentRenderPipeline != null;
            CreateMaterial(MaterialsDir + "/Lit.mat", srp ? "Universal Render Pipeline/Lit" : "Standard");
            CreateMaterial(MaterialsDir + "/Unlit.mat", srp ? "Universal Render Pipeline/Unlit" : "Unlit/Color");
        }

        static void CreateMaterial(string path, string shaderName)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            var shader = Shader.Find(shaderName);
            if (shader == null) { Debug.LogWarning("[Bastion Barons] Shader não encontrado: " + shaderName); return; }
            if (existing != null)
            {
                if (existing.shader != shader) { existing.shader = shader; EditorUtility.SetDirty(existing); }
                return;
            }
            AssetDatabase.CreateAsset(new Material(shader), path);
        }

        static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "Bastion Barons Studio";
            PlayerSettings.productName = "Bastion Barons";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, PackageId);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.SplashScreen.showUnityLogo = false;

            const string iconPath = "Assets/BastionBarons/Resources/Art/app_icon.png";
            var icon = AssetDatabase.LoadAssetAtPath<Texture2D>(iconPath);
            if (icon != null) PlayerSettings.SetIcons(NamedBuildTarget.Unknown, new[] { icon }, IconKind.Any);
        }
    }
}
