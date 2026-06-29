export class CrazyGamesManager {
  private static instance: CrazyGamesManager | null = null;
  private sdk: any = null;

  private constructor() {
    const win = window as any;
    if (win.CrazyGames && win.CrazyGames.SDK) {
      this.sdk = win.CrazyGames.SDK;
      console.log('CrazyGames SDK initialized successfully.');
    } else {
      console.warn('CrazyGames SDK not found. Running in fallback/local mode.');
    }
  }

  public static getInstance(): CrazyGamesManager {
    if (!CrazyGamesManager.instance) {
      CrazyGamesManager.instance = new CrazyGamesManager();
    }
    return CrazyGamesManager.instance;
  }

  /**
   * Syncs with preloader loading start
   */
  public loadingStart(): void {
    if (this.sdk && this.sdk.game) {
      try {
        this.sdk.game.loadingStart();
      } catch (e) {
        console.error('Error calling CrazyGames loadingStart:', e);
      }
    } else {
      console.log('[CrazyGames Fallback] loadingStart()');
    }
  }

  /**
   * Syncs with preloader loading complete
   */
  public loadingStop(): void {
    if (this.sdk && this.sdk.game) {
      try {
        this.sdk.game.loadingStop();
      } catch (e) {
        console.error('Error calling CrazyGames loadingStop:', e);
      }
    } else {
      console.log('[CrazyGames Fallback] loadingStop()');
    }
  }

  /**
   * Triggers when gameplay starts
   */
  public gameplayStart(): void {
    if (this.sdk && this.sdk.game) {
      try {
        this.sdk.game.gameplayStart();
      } catch (e) {
        console.error('Error calling CrazyGames gameplayStart:', e);
      }
    } else {
      console.log('[CrazyGames Fallback] gameplayStart()');
    }
  }

  /**
   * Triggers when gameplay pauses/stops (e.g. system overload screen)
   */
  public gameplayStop(): void {
    if (this.sdk && this.sdk.game) {
      try {
        this.sdk.game.gameplayStop();
      } catch (e) {
        console.error('Error calling CrazyGames gameplayStop:', e);
      }
    } else {
      console.log('[CrazyGames Fallback] gameplayStop()');
    }
  }

  /**
   * Requests midroll/rewarded advertisement
   */
  public requestAd(
    type: 'midroll' | 'rewarded',
    callbacks: { adStarted?: () => void; adFinished?: () => void; adError?: (err: any) => void }
  ): void {
    const adType = type === 'midroll' ? 'midgame' : 'rewarded';
    console.log(`[CrazyGames Manager] Requesting ad of type: ${adType}`);

    if (this.sdk && this.sdk.ad) {
      try {
        this.sdk.ad.requestAd(adType, {
          adStarted: () => {
            console.log(`CrazyGames ${adType} ad started.`);
            if (callbacks.adStarted) callbacks.adStarted();
          },
          adFinished: () => {
            console.log(`CrazyGames ${adType} ad finished.`);
            if (callbacks.adFinished) callbacks.adFinished();
          },
          adError: (error: any) => {
            console.error(`CrazyGames ${adType} ad error:`, error);
            if (callbacks.adError) callbacks.adError(error);
          }
        });
      } catch (e) {
        console.error('Error calling CrazyGames requestAd:', e);
        // Instant fallback execution to prevent freezing
        if (callbacks.adStarted) callbacks.adStarted();
        if (callbacks.adFinished) callbacks.adFinished();
      }
    } else {
      // Local development simulation: trigger start, wait 1 second, trigger finished
      console.log(`[CrazyGames Fallback] Simulating ${adType} ad sequence...`);
      if (callbacks.adStarted) callbacks.adStarted();
      setTimeout(() => {
        console.log(`[CrazyGames Fallback] Simulated ${adType} ad completed.`);
        if (callbacks.adFinished) callbacks.adFinished();
      }, 1000);
    }
  }
}
