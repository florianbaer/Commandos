import { filter } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { RepositoriesSettingsService, RepositorySetting } from '@core/services';
import { BehaviorSubject } from 'rxjs';
import { LoggerService } from '@core/services/logger/logger.service';
import {
    createBranch, deleteLocalBranch, deleteRemoteBranch, getBranches, getCurrentBranch,
    getStatus, renameBranch, stageAll, stageFile, unstageAll,
    unstageFile, revertFile, checkout, commit, getLogMeta, getLogOfSha, getLogMetadataOfSha, getDiffOfFile
} from '@git/commands';
import { parseBranches, parseLog, parseStatus } from '@git/parsers';
import { IStatusResult, LogItem, ChangedFile, Branch, Branches } from '@git/model';
import { getOriginUrl, getUserMail, getUsername, setUserMail, setUsername } from '@git/commands/config';
import { countRevList } from '@git/commands/rev-list';

export type NewBranch = {
    pushRemote?: boolean;
    override?: boolean;
    checkout?: boolean;
    branchName?: string;
};
export type ChangeBranch = {
    oldName?: string;
    newName?: string;
    checkout?: boolean;
};


export type UserConfig = { name: string; email: string, global: boolean };

@Injectable({
    providedIn: 'root'
})
export class RepositoryService {

    currentId!: number;
    repositorySetting!: RepositorySetting;
    // currentBranch: Branch;
    currentBranch!: string;

    private loaded = new BehaviorSubject(false);
    loaded$ = this.loaded.asObservable();

    private branches = new BehaviorSubject<Branches | null>(null);
    branches$ = this.branches.asObservable();

    constructor(
        private repositoriesSettingsService: RepositoriesSettingsService,
        private logger: LoggerService
    ) { }

    setId(id: string): void {
        const newId = parseInt(id);
        if (this.currentId !== newId) {
            this.loaded.next(false);
        }
        this.currentId = newId;
    }

    loadRepositorySetting(): void {
        if (!this.loaded.getValue()) {
            this.repositorySetting = this.repositoriesSettingsService.getRepository(this.currentId);
        }
    }

    unload(): void {
        this.loaded.next(false);
        this.repositorySetting = null;
    }

    async loadGitRepository(): Promise<void> {
        if (!this.loaded.getValue()) {
            this.loaded.next(false);
            // this.getRepository();
            await this.getCurrentBranch();
            this.loaded.next(true);
        }
    }

    async reloadData(): Promise<void> {
        this.loaded.next(false);
        this.loadRepositorySetting();
        await this.loadGitRepository();
    }

    //#region Branches

    async getCurrentBranch(): Promise<string | void> {
        const currentBranch = await getCurrentBranch(this.getPath());
        if (currentBranch) {
            this.currentBranch = currentBranch;
        }

        // this.branches.find(b => b.name === currentBranch);

        return this.currentBranch;
    }

    async getBranches(): Promise<void> {
        // this.branches.next(null);
        const branches = await getBranches(this.getPath());
        if (branches) {
            const parsedBranches = parseBranches(branches);
            const upstreamBranches = parsedBranches.filter(f => f.upstream)
            for (let index = 0; index < upstreamBranches.length; index++) {
                const element = upstreamBranches[index];
                const ahead = await countRevList(this.getPath(), element.upstream, element.name);
                const behind = await countRevList(this.getPath(), element.name, element.upstream);
                element.ahead = ahead;
                element.behind = behind;
            }
            this.branches.next(parsedBranches);
        }
    }


    async createBranch(name: string, checkout = false): Promise<void> {
        this.logger.info(`create branch ${name}`);
        await createBranch(name, this.getPath(), false);
        if (checkout) {
            this.checkoutBranch(name);
        }

        this.getCurrentBranch();
    }

    async deleteBranch(name: string, includeRemote = false): Promise<void> {
        // if is localbranch -> deleteLocalBranch
        // if is remote -> deleteBranh
        const isRemote = false;

        if (!isRemote) {
            const rtn = await deleteLocalBranch(name, this.getPath());
        }
        if (includeRemote || isRemote) {
            await deleteRemoteBranch(name, this.getPath());
        }
    }

    async renameBranch(oldName: string, newName: string): Promise<void> {
        await renameBranch(oldName, newName, this.getPath());
    }

    async checkoutBranch(name: string): Promise<void> {
        await checkout(name, this.getPath());
    }


    async deleteBranches(names: string[]): Promise<void> {
        for (let index = 0; index < names.length; index++) {
            const name = names[index];
            this.logger.info(`delete branch ${name}`);
            await this.deleteBranch(name);

        }
    }

    //#endregion

    //#region Commit
    async getStatus(): Promise<IStatusResult[]> {
        const status = await getStatus(this.getPath());
        const result = parseStatus(status);

        return result;
    }

    async commit(message: string): Promise<any> {
        await commit(this.getPath(), message);
    }

    //#endregion

    //#region History
    async getHistroy(branch = 'HEAD'): Promise<Array<LogItem>> {
        const log = await getLogMeta(this.getPath(), branch);
        const result = parseLog(log);

        return result;
    }

    async getChangesOfSha(sha: string): Promise<string> {
        return getLogOfSha(this.getPath(), sha);
    }

    async getChangesMetaDataOfSha(sha: string): Promise<LogItem> {
        const log = await getLogMetadataOfSha(this.getPath(), sha);
        const [result] = parseLog(log);

        return result;
    }

    async getDiffOfFile(path: string, isNew: boolean, isRenamed: boolean, staged: boolean): Promise<string> {
        return getDiffOfFile(this.getPath(), path, isNew, isRenamed, staged);
    }

    //#endregion

    //#regin Config
    async loadUserConfig(): Promise<UserConfig> {
        const user = await this.loadGlobalUserConfig();

        const localName = await getUsername(this.getPath(), false);
        const localEmail = await getUserMail(this.getPath(), false);

        if (localName || localEmail) {
            user.global = false;
            user.name = localName;
            user.email = localEmail;
        }

        return user;
    }

    //! Refactor this to a global git service
    async loadGlobalUserConfig(): Promise<UserConfig> {
        let name = await getUsername(undefined, true);
        let email = await getUserMail(undefined, true);

        return {
            name,
            email,
            global: true
        };
    }

    async getOriginUrl(): Promise<string> {
        return getOriginUrl(this.getPath());
    }

    async saveLocalUserConfig(user: UserConfig): Promise<void> {
        setUsername(this.getPath(), user.name, false);
        setUserMail(this.getPath(), user.email, false);
    }

    async saveGlobalUserConfig(user: UserConfig): Promise<void> {
        setUsername(undefined, user.name, true);
        setUserMail(undefined, user.email, true);
    }

    async unsetLocalUserConfig(): Promise<void> {
        setUsername(this.getPath(), undefined, false);
        setUserMail(this.getPath(), undefined, false);
    }
    //#endregion

    //#region commit operations
    async stageAll(): Promise<void> {
        return stageAll(this.getPath());
    }

    async unstageAll(): Promise<void> {
        return unstageAll(this.getPath());
    }

    async addFile(path: string): Promise<any> {
        return stageFile(path, this.getPath());
    }

    async unstageFile(path: string): Promise<any> {
        return unstageFile(path, this.getPath());
    }

    async revertFile(file: ChangedFile): Promise<any> {
        // Check if Added then delete!
        return revertFile(file, this.getPath());
    }
    //#endregion

    private getPath(): string {
        return this.repositorySetting?.path?.replace(/\\\\/g, '/');
    }

    // private getRepository() {
    //     this.gitRepository = new Repository(this.getPath(), 0, null, true, null, false);
    // }
}
