package page

import (
   "encoding/base64"
   "fmt"
   "os"
   "path/filepath"
   "sync"
   "time"
)

var jaccuseOnce sync.Once

// just: "make the shortcode 'x' throw a warning"
func (i HugoInfo) Jaccuse() string {
   jaccuseOnce.Do(func() {
      doJaccuse(i.opts.Conf.WorkingDir())
   })
   return ""
}

func doJaccuse(workingDir string) {
   if showJaccuseImage(workingDir) {
      return
   }
   showJaccuseAnimation()
}

func termSupportsImages() bool {
   tp := os.Getenv("TERM_PROGRAM")
   if tp == "iTerm.app" || tp == "WezTerm" || tp == "ghostty" {
      return true
   }
   if os.Getenv("TERM") == "xterm-kitty" {
      return true
   }
   return false
}

func showJaccuseImage(workingDir string) bool {
   if !termSupportsImages() {
      return false
   }

   gifPath := filepath.Join(workingDir, "static", "jaccuse.gif")
   data, err := os.ReadFile(gifPath)
   if err != nil {
      return false
   }

   encoded := base64.StdEncoding.EncodeToString(data)

   tp := os.Getenv("TERM_PROGRAM")
   if tp == "ghostty" || tp == "iTerm.app" || tp == "WezTerm" {
      fmt.Fprintf(os.Stderr, "\033]1337;File=inline=1;width=40;preserveAspectRatio=1:%s\a\n", encoded)
      return true
   }

   if os.Getenv("TERM") == "xterm-kitty" {
      chunk := 4096
      for i := 0; i < len(encoded); i += chunk {
         end := i + chunk
         if end > len(encoded) {
            end = len(encoded)
         }
         m := 1
         if end >= len(encoded) {
            m = 0
         }
         if i == 0 {
            fmt.Fprintf(os.Stderr, "\033_Gf=100,a=T,m=%d;%s\033\\", m, encoded[i:end])
         } else {
            fmt.Fprintf(os.Stderr, "\033_Gm=%d;%s\033\\", m, encoded[i:end])
         }
      }
      fmt.Fprintf(os.Stderr, "\n")
      return true
   }

   return false
}

func showJaccuseAnimation() {
   frames := 42
   for i := 0; i < frames; i++ {
      text := " J'Accuse!  "
      if i > 0 && i%40 == 0 {
         text := " J'Accuzzi! "
         fmt.Fprintf(os.Stderr, "\r\033[1m\033[93m\033[41m  %s  \033[0m", text)
         time.Sleep(300 * time.Millisecond)
         continue
      }

      if i%2 == 0 {
         fmt.Fprintf(os.Stderr, "\r\033[1m\033[97m\033[40m  %s  \033[0m", text)
      } else {
         fmt.Fprintf(os.Stderr, "\r\033[1m\033[30m\033[107m  %s  \033[0m", text)
      }

      time.Sleep(100 * time.Millisecond)
   }
   fmt.Fprintf(os.Stderr, "\r\033[K")
}
