export type InstallPromptEvent = Event & {
  platforms: string[];
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type InstallSnapshot = {
  promptEvent: InstallPromptEvent | null;
  installed: boolean;
  status: "idle" | "prompting" | "accepted" | "dismissed" | "error";
};

declare global {
  interface Window {
    __clcInstall?: InstallSnapshot;
  }
}

// Runs in <head>, before hydration or any lazy UI. No package imports, storage,
// or authentication dependency. The listener lives for the whole document.
export const installBootstrapScript = `(function(){
  if(window.__clcInstall)return;
  var s=window.__clcInstall={promptEvent:null,installed:false,status:"idle"};
  function notify(){window.dispatchEvent(new Event("clc-install-change"));}
  window.addEventListener("beforeinstallprompt",function(e){
    if(s.installed||typeof e.prompt!=="function")return;
    e.preventDefault();
    e.stopImmediatePropagation();
    s.promptEvent=e;s.status="idle";notify();
    e.userChoice.then(function(choice){
      if(s.promptEvent===e){s.promptEvent=null;s.status=choice.outcome;notify();}
    },function(){
      if(s.promptEvent===e){s.promptEvent=null;s.status="error";notify();}
    });
  });
  window.addEventListener("appinstalled",function(){
    s.installed=true;s.promptEvent=null;s.status="idle";notify();
  });
})();`;
